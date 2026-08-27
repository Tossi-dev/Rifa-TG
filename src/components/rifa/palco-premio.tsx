import { Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Premio } from "@/lib/config";

/** Vitrine do 1º prêmio no hero — card escuro, porque a foto tem fundo escuro. */
export function PalcoPremio({ premio }: { premio: Premio }) {
  return (
    <div className="rounded-3xl bg-escuro p-5 text-white shadow-lg sm:p-7">
      <div className="mb-4 flex items-center justify-between">
        <Badge variant="ouro" className="gap-1.5">
          <Trophy className="size-3" /> {premio.posicao}
        </Badge>
        <span className="text-xs font-semibold tracking-wide text-lima uppercase">
          Zero km
        </span>
      </div>

      <div className="grid place-items-center overflow-hidden rounded-2xl bg-escuro-2 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={premio.imagem}
          alt={premio.nome}
          width={748}
          height={1063}
          fetchPriority="high"
          className="h-auto w-full max-w-md"
        />
      </div>

      <h2 className="mt-5 text-2xl font-extrabold sm:text-3xl">
        {premio.nome}
      </h2>
      <p className="mt-1 text-sm text-white/70">{premio.chamada}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {premio.destaques.map((destaque) => (
          <span
            key={destaque}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85"
          >
            {destaque}
          </span>
        ))}
      </div>
    </div>
  );
}
