import { env } from "cloudflare:workers";
import { z } from "zod";
import { member, coordinator, failure } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    coordinator(await member());
    const input = z
      .string()
      .trim()
      .min(3)
      .max(250)
      .parse(new URL(req.url).searchParams.get("q"));
    const key =
      (env as unknown as Record<string, string>).GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY;
    const headers = { "Cache-Control": "private, no-store" };
    if (!key)
      return Response.json(
        {
          suggestions: [],
          message:
            "Busca Google ainda não ativada. Digite o endereço completo para continuar.",
        },
        { headers },
      );
    try {
      const res = await fetch(
        "https://places.googleapis.com/v1/places:autocomplete",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask":
              "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
          },
          body: JSON.stringify({
            input,
            languageCode: "pt-BR",
            regionCode: "br",
          }),
          signal: AbortSignal.timeout(6000),
        },
      );
      if (!res.ok) throw new Error("Places unavailable");
      const result = (await res.json()) as {
        suggestions?: {
          placePrediction?: { placeId: string; text: { text: string } };
        }[];
      };
      const suggestions = (result.suggestions || []).flatMap((s) =>
        s.placePrediction
          ? [
              {
                id: s.placePrediction.placeId,
                text: s.placePrediction.text.text,
              },
            ]
          : [],
      );
      return Response.json(
        {
          suggestions,
          message: suggestions.length
            ? ""
            : "Nenhum endereço encontrado. Você pode continuar com o endereço digitado.",
        },
        { headers },
      );
    } catch {
      return Response.json(
        {
          suggestions: [],
          message:
            "Busca indisponível agora. Você pode informar o endereço manualmente.",
        },
        { headers },
      );
    }
  } catch (e) {
    return failure(e);
  }
}
