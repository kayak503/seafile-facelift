/** Expected operational failure with a stable machine code and safe client message. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Converts internal failures into a deliberately small, non-sensitive JSON error shape. */
export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === 'CONFIGURATION_MISSING') {
    return Response.json(
      { error: 'not_configured', message: 'This drive app has not been configured.' },
      { status: 503 },
    );
  }
  return Response.json(
    { error: 'unexpected_error', message: 'Something went wrong. Please try again.' },
    { status: 500 },
  );
}
