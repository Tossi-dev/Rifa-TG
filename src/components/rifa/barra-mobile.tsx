import { ArrowRight, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RIFA, brl, linkWhatsApp } from "@/lib/config";

/** Barra fixa de conversão no celular + botão de WhatsApp no desktop. */
export function BarraMobile() {
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur lg:hidden">
        <div className="leading-tight">
          <strong className="block text-lg font-extrabold text-verde">
            {brl(RIFA.precoCota)}
          </strong>
          <span className="text-xs text-muted-foreground">por número</span>
        </div>
        {/* Alvo de toque de 48px na barra fixa do celular */}
        <Button asChild size="lg">
          <a href="#comprar">
            Quero participar <ArrowRight />
          </a>
        </Button>
      </div>

      <a
        href={linkWhatsApp(`Olá! Quero saber mais sobre a ${RIFA.titulo}.`)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        className="fixed right-6 bottom-6 z-40 hidden size-14 place-items-center rounded-full bg-[#25d366] text-[#06331a] shadow-lg lg:grid"
      >
        <MessageCircle className="size-6" />
      </a>
    </>
  );
}
