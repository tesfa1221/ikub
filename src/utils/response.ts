import { Response } from 'express';

export function successResponse(res: Response, data: any, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

export function errorResponse(res: Response, message: string, statusCode = 400, errors?: any) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors: errors || null,
    timestamp: new Date().toISOString(),
  });
}

export function paginatedResponse(
  res: Response,
  data: any[],
  total: number,
  page: number,
  limit: number,
  message = 'Success'
) {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
    timestamp: new Date().toISOString(),
  });
}
