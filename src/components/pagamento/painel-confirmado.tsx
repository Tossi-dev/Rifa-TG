"use client";

import Link from "next/link";
import { CircleCheck, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RIFA, brl, linkWhatsApp } from "@/lib/config";
import type { PedidoView } from "@/lib/pedido";

/** Comprovante: números comprados e dados do pedido pago. */
export function PainelConfirmado({ pedido }: { pedido: PedidoView }) {
  const plural = pedido.cotas === 1 ? "número" : "números";
  const texto = `Comprei ${pedido.cotas} ${plural} na ${RIFA.titulo}! Meus números: ${pedido.numeros.join(", ")} (pedido ${pedido.id})`;

  const linhas: Array<[string, string]> = [
    ["Pedido", pedido.id],
    ["Participante", pedido.nome],
    ["Cotas", String(pedido.cotas)],
    ["Valor pago", brl(pedido.valor)],
    ["Sorteio", RIFA.dataSorteioLabel],
  ];

  return (
    <div className="space-y-5 text-center">
      <CircleCheck className="mx-auto size-14 text-verde" />

      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          Pagamento confirmado!
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Boa sorte, {pedido.nome.split(" ")[0]}! Seus números já estão
          registrados no seu nome.
        </p>
      </div>

      <div className="text-left">
        <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
          {pedido.numeros.length === 1 ? "Seu número" : "Seus números"}
        </p>
        <div
          data-testid="numeros-comprados"
          className="flex flex-wrap gap-2 rounded-xl bg-secondary p-3"
        >
          {pedido.numeros.map((numero) => (
            <span
              key={numero}
              data-numero
              className="rounded-md bg-card px-2.5 py-1 font-mono text-sm font-bold shadow-xs"
            >
              {numero}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border">
        {linhas.map(([rotulo, valor], indice) => (
          <div key={rotulo}>
            {indice > 0 && <Separator />}
            <div className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">{rotulo}</span>
              <strong className="text-right">{valor}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 nao-imprimir">
        <Button asChild variant="zap">
          <a href={linkWhatsApp(texto)} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> Salvar no WhatsApp
          </a>
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          Salvar comprovante
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Guarde este comprovante. O resultado sai em {RIFA.dataSorteioLabel} e a
        gente entra em contato pelo WhatsApp cadastrado.
      </p>

      <Button asChild variant="ghost" className="w-full nao-imprimir">
        <Link href="/">Comprar mais números</Link>
      </Button>
    </div>
  );
}
