import { Check, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Premio } from "@/lib/config";

/** Card de um prêmio da lista. O primeiro ganha destaque visual. */
export function CardPremio({
  premio,
  destaque,
}: {
  premio: Premio;
  destaque: boolean;
}) {
  const Icone = destaque ? Zap : Check;

  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden py-0",
        destaque && "border-verde/40 ring-1 ring-verde/20"
      )}
    >
      <div
        className={cn(
          "relative grid place-items-center p-4",
          premio.imagemEscura ? "bg-escuro" : "bg-secondary"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={premio.imagem}
          alt={premio.nome}
          className="h-52 w-auto object-contain"
        />
        <Badge
          variant={destaque ? "ouro" : "suave"}
          className="absolute top-3 left-3"
        >
          {premio.posicao}
        </Badge>
      </div>

      <CardContent className="py-5">
        <span className="text-xs font-bold tracking-wide text-verde uppercase">
          {premio.chamada}
        </span>
        <h3 className="mt-1 text-xl font-extrabold">{premio.nome}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{premio.descricao}</p>

        <ul className="mt-4 space-y-1.5 text-sm">
          {premio.destaques.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Icone className="size-4 shrink-0 text-verde" /> {item}
            </li>
          ))}
        </ul>

        {premio.parceiro && (
          <p className="mt-4 text-xs text-muted-foreground">
            Parceria com{" "}
            {premio.parceiro.instagram ? (
              <a
                href={`https://instagram.com/${premio.parceiro.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-verde underline-offset-2 hover:underline"
              >
                {premio.parceiro.nome}
              </a>
            ) : (
              <strong className="text-foreground">{premio.parceiro.nome}</strong>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
