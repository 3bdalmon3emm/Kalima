import { PrismaClient } from "../generated/prisma/client";
import { redis } from "../../../libs/redis/client";
import { getEmailService } from "../emails/email.service";
import { prisma } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { IMAGE_SIZES } from "../../../libs/imageOptimize";
import {
  CreateCartDto,
  AddCartItemDto,
  UpdateCartItemDto,
  CheckoutDto,
  UpdateCartItemRequiredFieldsDto,
} from "../dtos/cart.dto";
import { imageService } from "./image.service";
import { purchasesService } from "./purchases.service";
import { userManagementService } from "./user-management.service";
import { addPurchaseEvent } from "./notificationStream.service";
import {
  getCachedCart,
  setCachedCart,
  invalidateCartCache,
} from "./cartCache.service";
import { validatePaymentForCheckout } from "./checkout-validation.service";
import { couponService } from "./coupon.service";
import type { Prisma, purchases } from "../generated/prisma/client";
import type { CreatePurchaseDto } from "../dtos/purchase.dto";

// Typed payloads from Prisma for cart items/purchases
type CartItemWithRelations = Prisma.cart_itemsGetPayload<{
  include: { products: true; cart_item_required_fields: true };
}>;
const cartWithItemsQueryInclude = {
  cart_items: {
    where: { deleted_at: null },
    select: {
      id: true,
      cart_id: true,
      product_id: true,
      // coupon_id: true,
      quantity: true,
      price_at_add: true,
      final_price: true,
      discount: true,
      required_fields_filled: true,
      created_at: true,
      updated_at: true,
      products: {
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          price_after_discount: true,
          type: true,
          serial: true,
          thumbnail_image: {
            select: {
              url: true,
            },
          },
        },
      },
      cart_item_required_fields: {
        select: {
          field_definition_id: true,
          value: true,
          required_field_definitions: {
            select: { label: true, field_type: true },
          },
        },
      },
      coupons: {
        select: {
          code: true,
          discount_amount: true,
          discount_percentage: true,
        },
      },
    },
  },
} satisfies Prisma.cartsInclude;

type CartWithItems = Prisma.cartsGetPayload<{
  include: typeof cartWithItemsQueryInclude;
}>;

// FieldType enum (kept as literal union so we don't rely on generated enum export)
type FieldType = "text" | "number" | "date" | "image";

// minimal shape used by calculators (accepts Decimal or number)
type CalcCartItem = {
  price_at_add: number | Prisma.Decimal;
  quantity: number;
  discount?: number | Prisma.Decimal | null;
  coupon_id?: number | null;
  required_fields?: { field_definition_id: number; value: string }[];
};

class CartService {
  // ============================================
  // APPLY COUPON TO CART ITEM
  // ============================================
  async applyCouponToCartItem(
    user_id: number,
    cart_item_id: number,
    coupon_code: string,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    // 1. Validate cart and cart item in parallel
    const [cart, cartItem] = await Promise.all([
      this.getActiveCartByUser(user_id, cartStatus),
      this.db.cart_items.findUnique({
        where: { id: cart_item_id },
        select: {
          id: true,
          discount: true,
          created_at: true,
          updated_at: true,
          deleted_at: true,
          cart_id: true,
          products: {
            select: {
              id: true,
              price: true,
              price_after_discount: true,
            },
          },
          quantity: true,
          price_at_add: true,
          final_price: true,
          required_fields_filled: true,
          coupon_id: true,
        },
      }),
    ]);
    if (!cartItem || cartItem.cart_id !== cart.id) {
      throw new NotFoundError("Cart item not found in user's cart");
    }

    // 2. Validate coupon (active, date range, product match, not already used by this user)
    const { isValid, coupon } = await couponService.validateCoupon(
      coupon_code,
      user_id,
      cartItem.products.id,
    );
    if (!isValid) throw new BadRequestError("Invalid coupon code");

    // 3. Ensure coupon is not already used on another item in this cart
    const usedOnOther = await this.db.cart_items.findFirst({
      where: {
        cart_id: cart.id,
        id: { not: cart_item_id },
        coupon_id: coupon.id,
        deleted_at: null,
      },
    });
    if (usedOnOther) {
      throw new BadRequestError(
        "This coupon is already applied to another item in your cart",
      );
    }

    // 4. Ensure this item does not already have a coupon
    if (cartItem.coupon_id) {
      throw new BadRequestError(
        "This item already has a coupon applied. Remove it first before applying a new one.",
      );
    }

    const productPrice = Math.min(
      Number(cartItem.products.price_after_discount),
      Number(cartItem.products.price),
    );

    // 5. Apply coupon to the item (set coupon_id, discount)
    let discount = 0;
    if (coupon.discount_amount && Number(coupon.discount_amount) > 0) {
      discount = Number(coupon.discount_amount);
    } else if (coupon.discount_percentage && coupon.discount_percentage > 0) {
      discount = Math.floor(
        Number(productPrice) *
          cartItem.quantity *
          (coupon.discount_percentage / 100),
      );
    }

    // Clamp so final_price never goes below 0
    const subtotal = Number(productPrice) * cartItem.quantity;
    const cappedDiscount = Math.min(discount, subtotal);
    const newFinalPrice = Math.max(0, subtotal - cappedDiscount);

    await this.db.cart_items.update({
      where: { id: cart_item_id },
      data: {
        coupon_id: coupon.id,
        discount: cappedDiscount,
        final_price: newFinalPrice,
      },
    });

    await invalidateCartCache(user_id);
    await this.#recalculateAndSaveCart(cart.id);
    return { success: true };
  }
  constructor(private db: PrismaClient = prisma) {}

  // ============================================
  // CREATE CART
  // ============================================
  async createCart(dto: CreateCartDto) {
    const existing = await this.db.carts.findFirst({
      where: { user_id: dto.user_id, status: "active" },
    });
    if (existing) {
      throw new BadRequestError("User already has an active cart");
    }
    return this.db.carts.create({
      data: { user_id: dto.user_id, status: "active" },
    });
  }

  // ============================================
  // START FAST BUY (Clears old fastbuys, creates new one, adds item)
  // ============================================
  async startFastBuy(user_id: number, product_id: number, quantity: number) {
    // 1. Delete any existing fastbuy carts for this user
    await this.db.carts.deleteMany({
      where: { user_id, status: "fastbuy", deleted_at: null },
    });
    await invalidateCartCache(`fastbuy:${user_id}` as any);

    // 2. Add the requested item into the fresh fastbuy cart
    await this.addItemToCart(
      user_id,
      { product_id, quantity },
      undefined,
      "fastbuy",
    );

    // 3. Return the fully formed fastbuy cart
    return this.getActiveCartByUser(user_id, "fastbuy");
  }

  async #getOrCreateCart(user_id: number): Promise<CartWithItems> {
    try {
      return await this.getActiveCartByUser(user_id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return this.createCart({ user_id }) as Promise<CartWithItems>;
      }
      throw err;
    }
  }

  // ============================================
  // GET CART BY USER (with Redis read-through cache)
  // ============================================
  async getActiveCartByUser(
    user_id: number,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    const cacheKeyUserId =
      cartStatus === "fastbuy" ? `fastbuy:${user_id}` : user_id;
    const cached = await getCachedCart<any>(cacheKeyUserId as any);
    if (cached) return cached;

    const cart = await this.db.carts.findFirst({
      where: { user_id, status: cartStatus },
      include: cartWithItemsQueryInclude,
      relationLoadStrategy: "join",
    });
    if (!cart) throw new NotFoundError("Active cart not found");

    const enriched = await this.#mergeRequiredFields(cart);
    await setCachedCart(cacheKeyUserId as any, enriched);
    return enriched;
  }

  /**
   * For each cart item, builds the full list of product required fields
   * with the user's filled value (or null if not yet filled).
   * Uses a single batched query for all products in the cart.
   */
  async #mergeRequiredFields(cart: CartWithItems) {
    const productIds = [...new Set(cart.cart_items.map((i) => i.product_id))];
    if (productIds.length === 0) return cart;

    // Batch-fetch all required field definitions for every product in the cart
    const productFields = this.db.product_required_fields?.findMany
      ? await this.db.product_required_fields.findMany({
          where: { product_id: { in: productIds }, active: true },
          select: {
            product_id: true,
            field_definition_id: true,
            is_required: true,
            required_field_definitions: {
              select: { label: true, field_type: true },
            },
          },
        })
      : [];

    // Group by product_id for O(1) lookup
    const fieldsByProduct = new Map<number, typeof productFields>();
    for (const pf of productFields || []) {
      let arr = fieldsByProduct.get(pf.product_id);
      if (!arr) {
        arr = [];
        fieldsByProduct.set(pf.product_id, arr);
      }
      arr.push(pf);
    }

    // Collect image IDs for batch fetching
    const imageIds = new Set<number>();
    for (const item of cart.cart_items) {
      for (const rf of item.cart_item_required_fields) {
        if (rf.required_field_definitions?.field_type === "image" && rf.value) {
          const id = Number(rf.value);
          if (!isNaN(id)) imageIds.add(id);
        }
      }
    }

    const imagesMap = new Map<number, string>();
    if (imageIds.size > 0) {
      const images = await this.db.images.findMany({
        where: { id: { in: Array.from(imageIds) } },
        select: { id: true, url: true },
      });
      for (const img of images) {
        imagesMap.set(img.id, img.url);
      }
    }

    // Merge into each cart item
    const enrichedItems = cart.cart_items.map((item) => {
      const defs = fieldsByProduct.get(item.product_id) ?? [];
      // Build a map of filled values by field_definition_id
      const filledMap = new Map<number, string>();
      for (const f of item.cart_item_required_fields) {
        filledMap.set(f.field_definition_id, f.value);
      }

      const cart_item_required_fields = defs.map((def) => {
        let val = filledMap.get(def.field_definition_id) ?? null;
        if (typeof val === "string" && val.trim() === "") {
          val = null;
        }

        if (
          val !== null &&
          def.required_field_definitions?.field_type === "image"
        ) {
          const imgId = Number(val);
          if (!isNaN(imgId) && imagesMap.has(imgId)) {
            val = imagesMap.get(imgId)!;
          }
        }

        return {
          field_definition_id: def.field_definition_id,
          is_required: def.is_required,
          required_field_definitions: def.required_field_definitions,
          value: val,
        };
      });

      // Recalculate required_fields_filled dynamically
      const required_fields_filled = cart_item_required_fields.every((f) => {
        if (!f.is_required) return true;
        return f.value !== null;
      });

      return { ...item, cart_item_required_fields, required_fields_filled };
    });

    return { ...cart, cart_items: enrichedItems };
  }

  // ============================================
  // ADD ITEM TO CART
  // ============================================
  async addItemToCart(
    user_id: number,
    dto: AddCartItemDto,
    file?: Express.Multer.File,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    let cart = await this.db.carts.findFirst({
      where: { user_id, status: cartStatus },
      select: { id: true },
    });

    if (!cart) {
      cart = await this.db.carts.create({
        data: { user_id, status: cartStatus },
        select: { id: true },
      });
    }

    const product = await this.db.products.findUnique({
      where: { id: dto.product_id },
      select: {
        id: true,
        price: true,
        price_after_discount: true,
        release_at: true,
      },
    });
    if (!product) throw new NotFoundError("Product not found");

    if (product.release_at) {
      const releaseAt = new Date(product.release_at);
      if (releaseAt > new Date()) {
        throw new BadRequestError(
          `This product has not been released yet. It releases at ${releaseAt.toISOString()}`,
        );
      }
    }

    const price_at_add = Math.min(
      Number(product.price),
      Number(product.price_after_discount),
    );

    // Use findFirst + conditional upsert to reduce roundtrips
    const existing = await this.db.cart_items.findFirst({
      where: {
        cart_id: cart.id,
        product_id: dto.product_id,
        deleted_at: null,
      },
      select: { id: true, quantity: true },
    });

    const cartItem = existing
      ? await this.db.cart_items.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + dto.quantity },
        })
      : await this.db.cart_items.create({
          data: {
            cart_id: cart.id,
            product_id: dto.product_id,
            quantity: dto.quantity,
            price_at_add: price_at_add,
            final_price: Number(price_at_add) * dto.quantity,
          },
        });

    // Handle required fields (including image upload) — batched
    if (dto.required_fields && dto.required_fields.length > 0) {
      const defIds = dto.required_fields.map(
        (x) => x.required_field_definition_id,
      );
      const defs = await this.db.required_field_definitions.findMany({
        where: { id: { in: defIds } },
        select: { id: true, field_type: true },
      });
      const defMap = new Map<number, FieldType>();
      for (const d of defs) defMap.set(d.id, d.field_type as FieldType);

      // Process image uploads first (must be sequential per file)
      const fieldsData: {
        cart_item_id: number;
        field_definition_id: number;
        value: string;
      }[] = [];
      for (const f of dto.required_fields) {
        let value = f.value;
        const fieldType = defMap.get(f.required_field_definition_id);
        if (fieldType === "image" && file) {
          const image = await imageService.uploadImage(file, {
            compress: true,
            quality: 80,
          });
          value = image.id.toString();
        }
        fieldsData.push({
          cart_item_id: cartItem.id,
          field_definition_id: f.required_field_definition_id,
          value,
        });
      }

      // Batch: delete old + insert all new in one call each
      await this.db.cart_item_required_fields.deleteMany({
        where: { cart_item_id: cartItem.id },
      });
      await this.db.cart_item_required_fields.createMany({ data: fieldsData });
    }

    const cacheKeyUserId =
      cartStatus === "fastbuy" ? `fastbuy:${user_id}` : user_id;
    await Promise.all([
      this.#recalculateAndSaveCart(cart.id),
      invalidateCartCache(cacheKeyUserId as any),
    ]);
    return cartItem;
  }

  // ============================================
  // REMOVE ITEM FROM CART
  // ============================================
  async removeItemFromCart(
    user_id: number,
    cart_item_id: number,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    const [cart, cartItem] = await Promise.all([
      this.getActiveCartByUser(user_id, cartStatus),
      this.db.cart_items.findUnique({
        where: { id: cart_item_id },
      }),
    ]);
    if (!cartItem || cartItem.cart_id !== cart.id) {
      throw new NotFoundError("Cart item not found in user's cart");
    }

    await this.db.cart_items.update({
      where: { id: cart_item_id },
      data: { deleted_at: new Date(), is_deleted: true },
    });

    // Recalculate cart totals and persist
    const cacheKeyUserId =
      cartStatus === "fastbuy" ? `fastbuy:${user_id}` : user_id;
    await this.#recalculateAndSaveCart(cart.id);
    await invalidateCartCache(cacheKeyUserId as any);
    return { success: true };
  }

  // ============================================
  // REMOVE COUPON FROM CART ITEM
  // ============================================
  async removeCouponFromCartItem(
    user_id: number,
    cart_item_id: number,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    const [cart, cartItem] = await Promise.all([
      this.getActiveCartByUser(user_id, cartStatus),
      this.db.cart_items.findUnique({ where: { id: cart_item_id } }),
    ]);
    if (!cartItem || cartItem.cart_id !== cart.id)
      throw new NotFoundError("Cart item not found in user's cart");

    await this.db.cart_items.update({
      where: { id: cart_item_id },
      data: {
        coupon_id: null,
        discount: 0,
        final_price: Number(cartItem.price_at_add) * cartItem.quantity,
      },
    });

    const cacheKeyUserId =
      cartStatus === "fastbuy" ? `fastbuy:${user_id}` : user_id;
    await this.#recalculateAndSaveCart(cart.id);
    await invalidateCartCache(cacheKeyUserId as any);
    return { success: true };
  }

  // ============================================
  // UPDATE ITEM QUANTITY
  // ============================================
  async updateCartItem(
    user_id: number,
    dto: UpdateCartItemDto,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    const [cart, cartItem] = await Promise.all([
      this.getActiveCartByUser(user_id, cartStatus),
      this.db.cart_items.findUnique({
        where: { id: dto.cart_item_id },
        select: {
          id: true,
          product_id: true,
          cart_id: true,
          price_at_add: true,
          discount: true,
          quantity: true,
          coupon_id: true,
        },
      }),
    ]);

    if (!cartItem || cartItem.cart_id !== cart.id) {
      throw new NotFoundError("Cart item not found in user's cart");
    }

    const [product, coupon] = await Promise.all([
      this.db.products.findUnique({
        where: { id: cartItem.product_id },
        select: {
          id: true,
          price: true,
          price_after_discount: true,
        },
      }),
      cartItem.coupon_id
        ? this.db.coupons.findUnique({
            where: { id: cartItem.coupon_id },
            select: {
              discount_amount: true,
              discount_percentage: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!product) {
      throw new NotFoundError("Product not found");
    }
    if (cartItem.coupon_id && !coupon) {
      throw new NotFoundError("Coupon not found");
    }

    const productPrice = Math.min(
      Number(product.price),
      Number(product.price_after_discount),
    );

    let discount = 0;
    if (coupon) {
      discount =
        Number(coupon.discount_amount) === 0
          ? (Number(coupon.discount_percentage) / 100) *
            Number(productPrice) *
            dto.quantity
          : Number(coupon.discount_amount);
    }

    const subtotal = Number(productPrice) * dto.quantity;
    const cappedDiscount = Math.min(discount, subtotal);
    const final_price = Math.max(0, subtotal - cappedDiscount);

    const updated = await this.db.cart_items.update({
      where: { id: dto.cart_item_id },
      data: {
        quantity: dto.quantity,
        discount: cappedDiscount,
        final_price: final_price,
      },
    });

    // Coupon discount recalculation is handled inside #recalculateAndSaveCart
    const cacheKeyUserId =
      cartStatus === "fastbuy" ? `fastbuy:${user_id}` : user_id;
    await this.#recalculateAndSaveCart(cart.id);
    await invalidateCartCache(cacheKeyUserId as any);
    return updated;
  }

  // ============================================
  // CLEAR CART
  // ============================================
  async clearCart(
    user_id: number,
    cartStatus: "active" | "fastbuy" = "active",
  ): Promise<CartWithItems> {
    const cart = await this.getActiveCartByUser(user_id, cartStatus);
    await this.db.$transaction([
      this.db.cart_items.updateMany({
        where: { cart_id: cart.id },
        data: { deleted_at: new Date(), is_deleted: true },
      }),
      this.db.carts.update({
        where: { id: cart.id },
        data: {
          total: 0,
          subtotal: 0,
          discount: 0,
          status: cartStatus,
        },
      }),
    ]);
    const cacheKeyUserId =
      cartStatus === "fastbuy" ? `fastbuy:${user_id}` : user_id;
    await invalidateCartCache(cacheKeyUserId as any);
    // Return empty cart structure without refetching from DB
    return {
      ...cart,
      cart_items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
    } as unknown as CartWithItems;
  }

  async getRepeatPurchaseItems(
    userId: number,
    cartStatus: "active" | "fastbuy" = "active",
  ): Promise<Array<{ id: number; title: string }>> {
    const cart = await this.db.carts.findFirst({
      where: { user_id: userId, status: cartStatus, is_deleted: false },
      select: {
        cart_items: {
          where: { is_deleted: false },
          select: { product_id: true },
        },
      },
    });

    const productIds = [
      ...new Set((cart?.cart_items ?? []).map(({ product_id }) => product_id)),
    ];
    if (productIds.length === 0) return [];

    const priorItems = await this.db.purchase_items.findMany({
      where: {
        product_id: { in: productIds },
        is_deleted: false,
        purchases: {
          user_id: userId,
          status: { in: ["pending", "received", "confirmed", "delivered"] },
          is_deleted: false,
        },
      },
      select: {
        product_id: true,
        products: { select: { id: true, title: true } },
      },
    });

    return [
      ...new Map(
        priorItems.map(({ products }) => [
          products.id,
          { id: products.id, title: products.title },
        ]),
      ).values(),
    ];
  }

  // ============================================
  // CHECKOUT PREVIEW (batched — avoids N+1)
  // ============================================
  async getCheckoutPreview(
    user_id: number,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    const cart = await this.getActiveCartByUser(user_id, cartStatus);
    const hasBooks = cart.cart_items.some(
      (i: any) => i.products?.type === "Book",
    );

    if (cart.cart_items.length === 0) {
      return {
        hasBooks: false,
        requiredFields: {
          common: [],
          itemsMissingFields: [],
        },
        isCheckoutReady: true,
      };
    }

    const subtotal = this.#calculateSubtotal(cart.cart_items);
    const discount = this.#calculateDiscount(cart.cart_items);
    const total = this.#calculateTotal(subtotal, discount);
    const commonRequiredFields =
      total > 0 ? ["numberTransferredFrom", "paymentScreenShot"] : [];

    const productIds = cart.cart_items.map((i) => i.product_id);
    const cartItemIds = cart.cart_items.map((i) => i.id);

    const [allProductRequiredFields, allFilledFields] = await Promise.all([
      this.db.product_required_fields?.findMany
        ? this.db.product_required_fields.findMany({
            where: {
              product_id: { in: productIds },
              is_required: true,
              active: true,
            },
            include: { required_field_definitions: true },
          })
        : Promise.resolve([]),
      this.db.cart_item_required_fields?.findMany
        ? this.db.cart_item_required_fields.findMany({
            where: { cart_item_id: { in: cartItemIds } },
            select: { cart_item_id: true, field_definition_id: true },
          })
        : Promise.resolve([]),
    ]);

    const requiredByProduct = new Map<
      number,
      Array<{
        field_definition_id: number;
        required_field_definitions: {
          id: number;
          label: string;
          field_type: string;
        } | null;
      }>
    >();
    for (const rf of allProductRequiredFields || []) {
      const list = requiredByProduct.get(rf.product_id) ?? [];
      list.push(rf);
      requiredByProduct.set(rf.product_id, list);
    }

    const filledByCartItem = new Map<number, Set<number>>();
    for (const f of allFilledFields || []) {
      const set = filledByCartItem.get(f.cart_item_id) ?? new Set<number>();
      set.add(f.field_definition_id);
      filledByCartItem.set(f.cart_item_id, set);
    }

    const itemsMissingFields: Array<{
      cart_item_id: number;
      product_id: number;
      product_name: string;
      missing_fields: Array<{ id: number; label: string; field_type: string }>;
    }> = [];

    for (const item of cart.cart_items) {
      const requiredFields = requiredByProduct.get(item.product_id) ?? [];
      if (requiredFields.length === 0) continue;

      const filledSet = filledByCartItem.get(item.id) ?? new Set();
      const missing = requiredFields.filter(
        (rf) => !filledSet.has(rf.field_definition_id),
      );
      if (missing.length > 0) {
        itemsMissingFields.push({
          cart_item_id: item.id,
          product_id: item.product_id,
          product_name:
            (item.products as any)?.title ?? (item.products as any)?.name ?? "",
          missing_fields: missing.map((m) => ({
            id: m.required_field_definitions?.id ?? 0,
            label: m.required_field_definitions?.label ?? "",
            field_type: m.required_field_definitions?.field_type ?? "text",
          })),
        });
      }
    }

    return {
      hasBooks,
      requiredFields: {
        common: commonRequiredFields,
        itemsMissingFields,
      },
      isCheckoutReady: itemsMissingFields.length === 0,
    };
  }

  // ============================================
  // CHECKOUT
  // ============================================
  async checkout(
    user_id: number,
    dto: CheckoutDto,
    payment_screenshot_file?: Express.Multer.File,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    // 1. Validate cart and required fields via unified preview logic
    const preview = await this.getCheckoutPreview(user_id, cartStatus);

    // Check if the cart is ready internally (item-specific missing fields)
    if (!preview.isCheckoutReady) {
      throw new BadRequestError(
        "Cart is missing required fields for some items. Please complete all required item fields before checkout.",
      );
    }

    const cart = await this.getActiveCartByUser(user_id, cartStatus);
    if (!cart.cart_items.length) {
      throw new BadRequestError("Cart is empty");
    }

    // Common fields validation is mostly handled by DTO + earlier controller checks,
    // but the payment specific fields are handled down below.

    // 3. Calculate totals (subtotal, discount, total, item count)
    const subtotal = this.#calculateSubtotal(cart.cart_items);
    const discount = this.#calculateDiscount(cart.cart_items);
    const total = this.#calculateTotal(subtotal, discount);
    const itemCount = this.#calculateItemCount(cart.cart_items);
    const isFreeOrder = total <= 0;

    // 4. Validate payment method, process payment, handle payment screenshot
    let payment_screenshot_id: number | null = null;
    let paymentMethod: { phone_number: string | null } | null = null;

    if (!isFreeOrder) {
      if (!dto.payment_method_id) {
        throw new BadRequestError("Payment method is required");
      }

      if (!payment_screenshot_file) {
        throw new BadRequestError("Payment screenshot is required");
      }

      const paymentScreenshot = await imageService.uploadImage(
        payment_screenshot_file,
        { optimize: IMAGE_SIZES.paymentReceipt },
      );
      payment_screenshot_id = paymentScreenshot.id;

      paymentMethod = await validatePaymentForCheckout(this.db, {
        total,
        numberTransferredFrom: dto.numberTransferredFrom,
        payment_method_id: dto.payment_method_id,
      });
    }

    // 5. Assemble purchase payload (typed)
    // We map each cart item directly to a purchase item without flattening
    const flattenedItems: CreatePurchaseDto["items"] = [];
    for (const item of cart.cart_items) {
      const unitPrice = Number(item.price_at_add);
      const itemDiscount = Number(item.discount || 0);
      const required_fields = (item.cart_item_required_fields || [])
        .filter(
          (rf) =>
            rf.value !== null && rf.value !== undefined && rf.value !== "",
        )
        .map((rf) => ({
          field_definition_id: rf.field_definition_id,
          value: String(rf.value),
        }));

      flattenedItems.push({
        product_id: item.product_id,
        price_at_purchase: unitPrice,
        discount: itemDiscount,
        quantity: item.quantity,
        final_price: Number(item.final_price || 0),
        coupon_id: (item as any).coupon_id || null, // handle missing strict type temporarily
        required_fields,
      });
    }

    const purchaseInput: CreatePurchaseDto = {
      user_id,
      payment_method_id: isFreeOrder ? null : (dto.payment_method_id ?? null),
      payment_screenshot_id,
      items: flattenedItems,
      subtotal,
      discount,
      total,
      notes: dto.notes,
      number_transferred_from: isFreeOrder
        ? null
        : (dto.numberTransferredFrom || null),
      payment_number: isFreeOrder
        ? null
        : (paymentMethod?.phone_number || null),
    };

    type PurchaseWithItems = Prisma.purchasesGetPayload<{
      include: {
        purchase_items: { include: { purchase_item_required_fields: true } };
      };
    }>;

    let createdPurchase: PurchaseWithItems | null = null;

    // 6. Transaction: create purchase, mark coupons, update analytics, clear cart
    await this.db.$transaction(async (tx) => {
      createdPurchase = await purchasesService.createPurchase(
        purchaseInput,
        tx as unknown as PrismaClient,
      );

      // Record coupon usage per user (does NOT deactivate the coupon globally)
      const cs = couponService;
      const seenCoupons = new Set<number>();
      for (const item of cart.cart_items) {
        const couponId = (item as { coupon_id?: number | null }).coupon_id;
        if (couponId && !seenCoupons.has(couponId)) {
          seenCoupons.add(couponId);
          await cs.recordCouponUsage(
            user_id,
            couponId,
            createdPurchase ? (createdPurchase as any).id : undefined,
            tx as unknown as PrismaClient,
          );
        }
      }

      // update analytics via user-management service (keeps user-related logic consolidated)
      await userManagementService.incrementUserAnalytics(
        user_id,
        Number(total),
        1,
        tx as unknown as PrismaClient,
      );

      await tx.carts.update({
        where: { id: cart.id },
        data: {
          status: "checked_out",
          subtotal,
          discount,
          total,
        },
      });
      await tx.cart_items.deleteMany({
        where: { cart_id: cart.id },
      });
    });

    const cacheKeyUserId =
      cartStatus === "fastbuy" ? `fastbuy:${user_id}` : user_id;
    await invalidateCartCache(cacheKeyUserId as any);

    if (createdPurchase) {
      const user = await this.db.users.findUnique({
        where: { id: user_id },
        select: { name: true, email: true },
      });
      addPurchaseEvent({
        purchase_id: createdPurchase.id,
        purchase_serial: createdPurchase.purchase_serial ?? "",
        user_id,
        total: Number(total),
        item_count: itemCount,
        customer_name: user?.name ?? "Customer",
      }).catch((err) =>
        console.error("[Cart] Failed to publish purchase notification:", err),
      );

      if (user?.email) {
        let productListHTML = "";
        cart.cart_items.forEach((item, index) => {
          const productTitle = item.products?.title || "Unknown Product";
          productListHTML +=
            "<tr><td style='text-align:center; padding: 8px; border-bottom: 1px solid #ddd;'>" +
            (index + 1) +
            "</td><td style='text-align:start; padding: 8px; border-bottom: 1px solid #ddd;'>" +
            productTitle +
            " x" +
            item.quantity +
            "</td></tr>";
        });

        getEmailService()
          .sendOrderPendingEmail(user.email, {
            name: user.name,
            purchaseSerial: createdPurchase.purchase_serial ?? "N/A",
            totalItems: itemCount,
            productListHTML,
            ordersUrl: `${process.env.APP_URL || ""}/orders`,
          })
          .catch((err) =>
            console.error("[Cart] Failed to send order pending email:", err),
          );
      }
    }

    return {
      success: true,
      purchase: createdPurchase ? this.purchaseSnapshot(createdPurchase) : null,
      subtotal,
      discount,
      total,
      itemCount,
    };
  }

  // ============================================
  // PRIVATE CALCULATION METHODS
  // ============================================
  #calculateSubtotal(cartItems: CalcCartItem[]): number {
    return cartItems.reduce(
      (sum, item) => sum + Number(item.price_at_add) * item.quantity,
      0,
    );
  }

  #calculateDiscount(cartItems: CalcCartItem[]): number {
    // Assumes each item has a discount field (0 if none)
    return cartItems.reduce((sum, item) => sum + Number(item.discount || 0), 0);
  }

  #calculateTotal(subtotal: number, discount: number): number {
    return Math.max(0, subtotal - discount);
  }

  #calculateItemCount(cartItems: CalcCartItem[]): number {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  async #recalculateAndSaveCart(cart_id: number): Promise<void> {
    const updatedCartItems = await this.db.cart_items.findMany({
      where: { cart_id, deleted_at: null },
    });

    // Batch-fetch coupons for items that have them (avoids N+1)
    const couponIds = [
      ...new Set(
        updatedCartItems
          .filter((i) => i.coupon_id)
          .map((i) => i.coupon_id as number),
      ),
    ];
    const couponsMap = new Map<
      number,
      { discount_percentage: number | null; discount_amount: Prisma.Decimal | number | null }
    >();
    if (couponIds.length > 0) {
      const coupons = await this.db.coupons.findMany({
        where: { id: { in: couponIds } },
        select: { id: true, discount_percentage: true, discount_amount: true },
      });
      for (const c of coupons) couponsMap.set(c.id, c);
    }

    // Recompute discounts and batch updates
    const updates: { id: number; discount: number; final_price: number }[] = [];
    for (const item of updatedCartItems) {
      if (item.coupon_id) {
        const coupon = couponsMap.get(item.coupon_id);
        if (coupon) {
          const subtotal = Number(item.price_at_add) * item.quantity;
          const rawDiscount =
            coupon.discount_percentage && coupon.discount_percentage > 0
              ? Math.floor(
                  subtotal * (coupon.discount_percentage / 100),
                )
              : Number(coupon.discount_amount || 0);
          const expectedDiscount = Math.min(rawDiscount, subtotal);
          if (expectedDiscount !== Number(item.discount || 0)) {
            const finalPrice = Math.max(0, subtotal - expectedDiscount);
            updates.push({ id: item.id, discount: expectedDiscount, final_price: finalPrice });
            (item as unknown as { discount?: number }).discount =
              expectedDiscount;
            (item as unknown as { final_price?: number }).final_price =
              finalPrice;
          }
        }
      }
    }

    if (updates.length > 0) {
      await Promise.all(
        updates.map((u) =>
          this.db.cart_items.update({
            where: { id: u.id },
            data: { discount: u.discount, final_price: u.final_price },
          }),
        ),
      );
    }

    const subtotal = this.#calculateSubtotal(updatedCartItems);
    const discount = this.#calculateDiscount(updatedCartItems);
    const total = this.#calculateTotal(subtotal, discount);

    await this.db.carts.update({
      where: { id: cart_id },
      data: { subtotal, discount, total },
    });
  }

  // ============================================
  // UPDATE REQUIRED FIELDS FOR CART ITEM (JSON Text)
  // ============================================
  async updateCartItemRequiredFields(
    user_id: number,
    dto: UpdateCartItemRequiredFieldsDto,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    // Fetch cart item and user's cart in parallel
    const [cartItem, cart] = await Promise.all([
      this.db.cart_items.findUnique({ where: { id: dto.cart_item_id } }),
      this.getActiveCartByUser(user_id, cartStatus),
    ]);

    if (!cartItem) throw new NotFoundError("Cart item not found");
    if (cartItem.cart_id !== cart.id)
      throw new BadRequestError("Cart item does not belong to user's cart");

    const product = await this.db.products.findUnique({
      where: { id: cartItem.product_id },
      select: {
        product_required_fields: {
          select: { id: true, field_definition_id: true, is_required: true },
        },
      },
    });
    if (!product) throw new NotFoundError("Product not found");

    // preload definitions to determine if any required field expects an image
    const defIds = dto.required_fields.map(
      (x) => x.required_field_definition_id,
    );
    const defs = await this.db.required_field_definitions.findMany({
      where: { id: { in: defIds } },
      select: { id: true, field_type: true },
    });
    const defMap = new Map<number, FieldType>();
    for (const d of defs) defMap.set(d.id, d.field_type as FieldType);

    // Build field values
    const operations: Promise<unknown>[] = [];
    for (const f of dto.required_fields) {
      const is_required = product.product_required_fields.find(
        (x) => x.field_definition_id === f.required_field_definition_id,
      )?.is_required;

      let value: string | null = f.value;
      if (typeof value === "string" && value.trim() === "") {
        value = null; // empty string becomes null representing not-filled
      }

      const fieldType = defMap.get(f.required_field_definition_id);
      if (fieldType === "image" && is_required) {
        throw new BadRequestError(
          `Field ${f.required_field_definition_id} requires an image upload via the dedicated form-data endpoint.`,
        );
      }

      const existing = await this.db.cart_item_required_fields.findFirst({
        where: {
          cart_item_id: dto.cart_item_id,
          field_definition_id: f.required_field_definition_id,
        },
      });

      if (existing) {
        if (value === null && !is_required) {
          operations.push(
            this.db.cart_item_required_fields.delete({
              where: { id: existing.id },
            }),
          );
        } else {
          operations.push(
            this.db.cart_item_required_fields.update({
              where: { id: existing.id },
              data: { value },
            }),
          );
        }
      } else if (value !== null) {
        operations.push(
          this.db.cart_item_required_fields.create({
            data: {
              cart_item_id: dto.cart_item_id,
              field_definition_id: f.required_field_definition_id,
              value,
            },
          }),
        );
      }
    }
    await Promise.all(operations);

    // After updating, recalculate if the entire item is now "filled"
    const allDefs = await this.db.product_required_fields.findMany({
      where: { product_id: cartItem.product_id, active: true },
    });
    const requiredDefIds = allDefs
      .filter((d) => d.is_required)
      .map((d) => d.field_definition_id);

    const filledFields = await this.db.cart_item_required_fields.findMany({
      where: { cart_item_id: dto.cart_item_id },
      select: { field_definition_id: true, value: true },
    });

    const isFilled = requiredDefIds.every((reqId) => {
      const match = filledFields.find((f) => f.field_definition_id === reqId);
      return match && match.value.trim() !== "";
    });

    await this.db.cart_items.update({
      where: { id: dto.cart_item_id },
      data: { required_fields_filled: isFilled },
    });

    await invalidateCartCache(user_id);
    return { success: true };
  }

  // ============================================
  // UPDATE REQUIRED FIELD IMAGE FOR CART ITEM (FormData)
  // ============================================
  async updateCartItemRequiredFieldImage(
    user_id: number,
    dto: import("../dtos/cart.dto").UpdateCartItemRequiredFieldImageDto,
    file: Express.Multer.File,
    cartStatus: "active" | "fastbuy" = "active",
  ) {
    if (!file) throw new BadRequestError("Image file is required");

    const [cartItem, cart] = await Promise.all([
      this.db.cart_items.findUnique({ where: { id: dto.cart_item_id } }),
      this.getActiveCartByUser(user_id, cartStatus),
    ]);
    if (!cartItem) throw new NotFoundError("Cart item not found");
    if (cartItem.cart_id !== cart.id)
      throw new BadRequestError("Cart item does not belong to user's cart");

    const def = await this.db.required_field_definitions.findUnique({
      where: { id: dto.required_field_definition_id },
      select: { id: true, field_type: true },
    });

    if (!def) throw new NotFoundError("Required field definition not found");
    if (def.field_type !== "image") {
      throw new BadRequestError(`Field ${def.id} is not an image type.`);
    }

    const image = await imageService.uploadImage(file, {
      compress: true,
      quality: 80,
    });
    const value = image.id.toString();

    const existing = await this.db.cart_item_required_fields.findFirst({
      where: {
        cart_item_id: dto.cart_item_id,
        field_definition_id: dto.required_field_definition_id,
      },
    });

    if (existing) {
      await this.db.cart_item_required_fields.update({
        where: { id: existing.id },
        data: { value },
      });
    } else {
      await this.db.cart_item_required_fields.create({
        data: {
          cart_item_id: dto.cart_item_id,
          field_definition_id: dto.required_field_definition_id,
          value,
        },
      });
    }

    const allDefs = await this.db.product_required_fields.findMany({
      where: { product_id: cartItem.product_id, active: true },
    });
    const requiredDefIds = allDefs
      .filter((d) => d.is_required)
      .map((d) => d.field_definition_id);

    const filledFields = await this.db.cart_item_required_fields.findMany({
      where: { cart_item_id: dto.cart_item_id },
      select: { field_definition_id: true, value: true },
    });

    const isFilled = requiredDefIds.every((reqId) => {
      const match = filledFields.find((f) => f.field_definition_id === reqId);
      return match && match.value.trim() !== "";
    });

    await this.db.cart_items.update({
      where: { id: dto.cart_item_id },
      data: { required_fields_filled: isFilled },
    });

    await invalidateCartCache(user_id);
    return { success: true };
  }

  // ============================================
  // Helper methods
  // ============================================
  private purchaseSnapshot(purchase: any) {
    const snapshot = {
      id: purchase.id,
      status: purchase.status,
      subtotal: purchase.subtotal,
      discount: purchase.discount,
      total: purchase.total,
      payment_method_id: purchase.payment_method_id,
      purchase_serial: purchase.purchase_serial,
      purchase_items:
        purchase.purchase_items?.map((item: any) => ({
          created_at: item.created_at,
          price_at_purchase: item.price_at_purchase,
          discount: item.discount,
          products: item.products
            ? {
                id: item.products.id,
                title: item.products.title,
                serial: item.products.serial,
                type: item.products.type,
                thumbnail_image: item.products.thumbnail_image
                  ? {
                      url: item.products.thumbnail_image.url,
                    }
                  : null,
              }
            : null,
        })) || [],
    };
    return snapshot;
  }
}

export const cartService = new CartService();
export default CartService;
