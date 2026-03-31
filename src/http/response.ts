import type { Response } from "express";

export type ApiSuccessBody<T> = { success: true; data: T };

export type ApiErrorBody = {
  success: false;
  error: { code: string; message: string };
};

export function ok<T>(res: Response, status: number, data: T): void {
  const body: ApiSuccessBody<T> = { success: true, data };
  res.status(status).json(body);
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  const body: ApiErrorBody = { success: false, error: { code, message } };
  res.status(status).json(body);
}
