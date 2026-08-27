"use client";

import Link from "next/link";
import { ArrowLeft, QrCode } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RIFA, brl } from "@/lib/config";
import type { PedidoView } from "@/lib/pedido";
import { AvisoDemonstracao } from "./aviso-demonstracao";
import { CopiaECola } from "./copia-e-cola";
import { RelogioPix } from "./relogio-pix";

/** Tela de pagamento pendente: QR Code, copia e cola e cronômetro da reserva. */
export function PainelPix({
  pedido,
  restante,
  copiado,
  aoCopiar,
  simulando,
  aoSimular,
}: {
  pedido: PedidoView;
  restante: number | null;
  copiado: boolean;
  aoCopiar: () => void;
  simulando: boolean;
  aoSimular: () => void;
}) {
  return (
    <div className="space-y-5 text-center">
      <Badge variant="suave" className="gap-1.5">
        <QrCode className="size-3" /> Falta só o pagamento
      </Badge>

      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          Pague com Pix para garantir
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Abra o app do seu banco, escaneie o QR Code e pronto. Assim que o
          pagamento cair, seus números aparecem aqui — esta tela muda sozinha.
        </p>
      </div>

      {pedido.imagemQrCode && (
        <div className="mx-auto w-fit rounded-2xl border border-border bg-card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pedido.imagemQrCode}
            alt="QR Code do Pix"
            className="size-56 sm:size-64"
          />
        </div>
      )}

      <div>
        <div className="text-3xl font-extrabold text-verde">
          {brl(pedido.valor)}
        </div>
        <p className="text-sm text-muted-foreground">
          {pedido.cotas}{" "}
          {pedido.cotas === 1 ? "cota" : "cotas"} · pedido{" "}
          {pedido.id}
        </p>
      </div>

      <CopiaECola
        codigo={pedido.codigoPix ?? ""}
        copiado={copiado}
        aoCopiar={aoCopiar}
      />

      {restante !== null && <RelogioPix restante={restante} />}

      <p className="text-sm text-muted-foreground">
        Aguardando a confirmação do pagamento...
      </p>

      {pedido.demonstracao && (
        <AvisoDemonstracao
          podeSimular={pedido.podeSimular}
          simulando={simulando}
          aoSimular={aoSimular}
        />
      )}

      <Button asChild variant="ghost" className="w-full">
        <Link href="/">
          <ArrowLeft /> Voltar para a {RIFA.titulo}
        </Link>
      </Button>
    </div>
  );
}
