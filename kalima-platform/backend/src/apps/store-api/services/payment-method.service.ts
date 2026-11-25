import { payment_methods, Prisma, images } from "../generated/prisma/client";
import { NotFoundError, BadRequestError } from "../../../libs/errors";
import { prisma } from "../../../libs/db/prisma";
import { imageService } from "./image.service";

export type PaymentMethodResponse = Omit<payment_methods, "image_id"> & {
  image_url: string | null;
};

function formatPaymentMethod(
  pm: payment_methods & { images: images | null },
): PaymentMethodResponse {
  const { image_id, images, ...rest } = pm;
  return {
    ...rest,
    image_url: images?.url || null,
  };
}

export const paymentMethodService = {
  /**
   * List all payment methods
   */
  async listPaymentMethods(filters?: {
    status?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: PaymentMethodResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    // Deleted methods never list.
    const where: Prisma.payment_methodsWhereInput = { is_deleted: { not: true } };

    if (filters?.status !== undefined) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.name = { contains: filters.search, mode: "insensitive" };
    }

    const [data, count] = await Promise.all([
      prisma.payment_methods.findMany({
        where,
        include: {
          images: true,
        },
        skip,
        take: limit,
      }),
      prisma.payment_methods.count({ where }),
    ]);

    return {
      data: data.map(formatPaymentMethod),
      total: count,
      page,
      limit,
    };
  },

  /**
   * Get a single payment method by ID
   */
  async getPaymentMethodById(id: number): Promise<PaymentMethodResponse> {
    const paymentMethod = await prisma.payment_methods.findUnique({
      where: { id },
      include: {
        images: true,
      },
    });

    if (!paymentMethod) {
      throw new NotFoundError(`Payment method with ID ${id} not found.`);
    }

    return formatPaymentMethod(paymentMethod);
  },

  /**
   * Create a new payment method
   */
  async createPaymentMethod(
    data: { name: string; phone_number: string; status?: boolean },
    file?: Express.Multer.File,
  ): Promise<PaymentMethodResponse> {
    let image_id: number | null = null;

    if (file) {
      const image = await imageService.uploadImage(file, { compress: true });
      image_id = image.id;
    }

    const created = await prisma.payment_methods.create({
      data: {
        name: data.name,
        phone_number: data.phone_number,
        status: data.status !== undefined ? data.status : true,
        image_id,
      },
      include: {
        images: true,
      },
    });

    return formatPaymentMethod(created);
  },

  /**
   * Update an existing payment method
   */
  async updatePaymentMethod(
    id: number,
    data: { name?: string; phone_number?: string; status?: boolean },
    file?: Express.Multer.File,
  ): Promise<PaymentMethodResponse> {
    const existing = await prisma.payment_methods.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Payment method with ID ${id} not found.`);
    }

    let image_id = existing.image_id;

    if (file) {
      const image = await imageService.replaceImage(existing.image_id, file, {
        compress: true,
      });
      image_id = image.id;
    }

    const updated = await prisma.payment_methods.update({
      where: { id },
      data: {
        name: data.name,
        phone_number: data.phone_number,
        status: data.status,
        image_id,
      },
      include: {
        images: true,
      },
    });

    return formatPaymentMethod(updated);
  },

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(id: number): Promise<void> {
    const existing = await prisma.payment_methods.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Payment method with ID ${id} not found.`);
    }

    // Attempt to delete DB record
    await prisma.payment_methods.delete({
      where: { id },
    });

    // Clean up associated image if it exists
    if (existing.image_id) {
      await imageService.deleteImage(existing.image_id).catch(() => {});
    }
  },
};
