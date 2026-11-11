import { Request, Response, NextFunction, RequestHandler } from "express";
import { BadRequestError } from "../../libs/errors";

// Small request helpers shared by the exam-api controllers.

export function userId(req: Request): number {
  const user = (req as any).user;
  return Number(user?.userId || user?.id);
}

export function idParam(req: Request, name = "id"): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestError(`Invalid ${name}`);
  return n;
}

export function optionalId(raw: unknown, name: string): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestError(`Invalid ${name}`);
  return n;
}

export function idList(raw: unknown, name = "ids"): number[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestError(`${name} must be a non-empty list`);
  const ids = raw.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new BadRequestError(`Invalid ${name}`);
  return [...new Set(ids)];
}

export function requiredName(raw: unknown, name = "name", max = 255): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) throw new BadRequestError(`${name} is required`);
  if (value.length > max) throw new BadRequestError(`${name} is too long`);
  return value;
}

// Wraps an async handler so its errors reach the error middleware.
export function handle(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
