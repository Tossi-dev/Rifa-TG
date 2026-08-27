"use client";

import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Cronômetro da cobrança Pix. Fica vermelho nos últimos 5 minutos.
 *
 * É o prazo do QR Code, não de reserva: nenhum número está preso esperando
 * este relógio. Se o tempo acabar, ninguém perdeu cota nenhuma.
 */
export function RelogioPix({ restante }: { restante: number }) {
  const minutos = Math.floor(restante / 60_000);
  const segundos = Math.floor((restante % 60_000) / 1000);
  const urgente = restante < 5 * 60_000;

  return (
    <p
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold",
        urgente && "bg-destructive/10 text-destructive"
      )}
    >
      <Clock className="size-4" /> Este Pix vale por{" "}
      {String(minutos).padStart(2, "0")}:{String(segundos).padStart(2, "0")}
    </p>
  );
}
