import { NextResponse } from 'next/server';
import { GsyncApiError } from './gsyncClient';
import { HttpError } from './httpError';

/** Envolve um route handler do App Router com tratamento uniforme de erro (JSON + status certo). */
export function withErrorHandling(handler) {
  return async function wrapped(request, context) {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ success: false, mensagem: err.message }, { status: err.status });
      }
      if (err instanceof GsyncApiError) {
        const status = err.status >= 400 && err.status < 600 ? err.status : 502;
        return NextResponse.json({ success: false, mensagem: err.message }, { status });
      }
      console.error(err);
      return NextResponse.json({ success: false, mensagem: 'Erro interno inesperado.' }, { status: 500 });
    }
  };
}
