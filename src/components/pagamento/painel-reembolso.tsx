import Link from "next/link";
import { MessageCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RIFA, brl, linkWhatsApp } from "@/lib/config";
import type { PedidoView } from "@/lib/pedido";

/**
 * Caso raro e honesto: o pagamento entrou, mas a rifa esgotou no intervalo.
 *
 * Ninguém recebe número que não existe. A tela assume o problema, diz o valor
 * exato a devolver e dá o caminho direto para falar com o organizador — o
 * pedido já está na fila de reembolso do painel.
 */
export function PainelReembolso({ pedido }: { pedido: PedidoView }) {
  const texto = `Olá! Paguei o pedido ${pedido.id} (${brl(pedido.valor)}) na ${RIFA.titulo}, mas as cotas esgotaram. Gostaria de combinar a devolução.`;

  return (
    <div className="space-y-5 text-center">
      <TriangleAlert className="mx-auto size-14 text-destructive" />

      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          Seu pagamento vai ser devolvido
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          As cotas se esgotaram no intervalo entre a cobrança e a confirmação do
          seu Pix, então não há números para entregar. O valor de{" "}
          <strong className="text-foreground">{brl(pedido.valor)}</strong> será
          devolvido integralmente.
        </p>
      </div>

      <div className="rounded-xl bg-secondary px-4 py-3 text-sm">
        Pedido <strong>{pedido.id}</strong> · já registrado para devolução.
      </div>

      <Button asChild variant="zap" className="w-full">
        <a href={linkWhatsApp(texto)} target="_blank" rel="noopener noreferrer">
          <MessageCircle /> Falar com o organizador
        </a>
      </Button>

      <Button asChild variant="ghost" className="w-full">
        <Link href="/">Voltar para a {RIFA.titulo}</Link>
      </Button>
    </div>
  );
}
