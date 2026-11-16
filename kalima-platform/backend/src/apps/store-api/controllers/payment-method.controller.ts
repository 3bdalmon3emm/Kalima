import { Request, Response, NextFunction } from "express";
import { isStaff } from "../../../libs/auth/roleRank";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { paymentMethodService } from "../services/payment-method.service";
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from "../dtos/payment-method.dto";
import { ValidationError, BadRequestError } from "../../../libs/errors";

async function validateDto<T extends object>(
  DtoClass: new () => T,
  body: unknown,
): Promise<T> {
  const dto = plainToInstance(DtoClass, body);
  const validationErrors = await validate(dto);

  if (validationErrors.length > 0) {
    const errors = validationErrors.flatMap((err) =>
      Object.values(err.constraints || {}),
    );
    throw new ValidationError(errors);
  }

  return dto;
}

export const paymentMethodController = {
  async listPaymentMethods(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // Customers see only open methods; staff see all, to turn them back on.
      const staff = isStaff((req as any).user?.roles);
      const status = !staff
        ? true
        : req.query.status !== undefined
          ? req.query.status === "true"
          : undefined;
      const search = req.query.search as string | undefined;
      const page = req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined;

      const results = await paymentMethodService.listPaymentMethods({
        status,
        search,
        page,
        limit,
      });
      res.status(200).json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  },

  async getPaymentMethod(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) throw new BadRequestError("Invalid payment method ID");

      const result = await paymentMethodService.getPaymentMethodById(id);
      if (!isStaff((req as any).user?.roles) && (result as any)?.status !== true) {
        throw new BadRequestError("This payment method is not available; choose another one");
      }
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async createPaymentMethod(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      console.log(
        "[DEBUG createPaymentMethod] Content-Type:",
        req.headers["content-type"],
      );
      console.log("[DEBUG createPaymentMethod] Body:", req.body);
      console.log(
        "[DEBUG createPaymentMethod] File:",
        req.file ? req.file.originalname : "No file",
      );

      const dto = await validateDto(CreatePaymentMethodDto, req.body);
      const file = req.file as Express.Multer.File | undefined;
      const result = await paymentMethodService.createPaymentMethod(dto, file);

      res.status(201).json({
        success: true,
        message: "Payment method created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async updatePaymentMethod(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) throw new BadRequestError("Invalid payment method ID");

      const dto = await validateDto(UpdatePaymentMethodDto, req.body);
      const file = req.file as Express.Multer.File | undefined;
      const result = await paymentMethodService.updatePaymentMethod(
        id,
        dto,
        file,
      );

      res.status(200).json({
        success: true,
        message: "Payment method updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async deletePaymentMethod(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) throw new BadRequestError("Invalid payment method ID");

      await paymentMethodService.deletePaymentMethod(id);

      res.status(200).json({
        success: true,
        message: "Payment method deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },
};

export default paymentMethodController;
