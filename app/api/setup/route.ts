import { errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    rateLimit(request, 6, 60_000);
    return Response.json(
      {
        error: 'environment_only',
        message: 'Configuration can only be changed through Docker Compose or environment variables.',
      },
      { status: 403 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
