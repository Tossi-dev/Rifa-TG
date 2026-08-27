"use client";

/* =========================================================================
 *  Botões do placar do vendedor.
 *
 *  Existem porque o link de venda é comprido e ninguém digita URL no celular.
 *  Sem um toque para copiar e outro para disparar no WhatsApp, o vendedor
 *  volta a pedir o link para o organizador — que é exatamente o trabalho que
 *  esta página nasceu para eliminar.
 * ========================================================================= */

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { linkWhatsApp } from "@/lib/vendedores";

export function AcoesPlacar({
  link,
  mensagem,
}: {
  link: string;
  mensagem: string;
}) {
  const [copiado, setCopiado] = useState<boolean>(false);
  const [falha, setFalha] = useState<boolean>(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* Navegador antigo ou página sem HTTPS bloqueia a área de transferência.
         O link continua visível na tela logo acima, então o aviso só precisa
         dizer isso — não adianta insistir num botão que não funciona ali. */
      setFalha(true);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copiar()} variant="outline">
          {copiado ? <Check /> : <Copy />}
          {copiado ? "Link copiado" : "Copiar meu link"}
        </Button>
        <Button
          onClick={() =>
            window.open(
              linkWhatsApp(mensagem),
              "_blank",
              "noopener,noreferrer"
            )
          }
        >
          <MessageCircle /> Mandar no WhatsApp
        </Button>
      </div>
      {falha && (
        <p className="text-xs text-muted-foreground">
          Seu navegador não deixou copiar sozinho. Segure o dedo no endereço
          acima e copie à mão.
        </p>
      )}
    </div>
  );
}
