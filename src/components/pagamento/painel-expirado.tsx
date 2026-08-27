import Link from "next/link";

import { Button } from "@/components/ui/button";
import { RIFA } from "@/lib/config";

/**
 * Cobrança Pix vencida.
 *
 * Nada se perdeu: como os números só saem com o pagamento confirmado, este
 * pedido nunca segurou cota de ninguém — nem a do próprio comprador.
 */
export function PainelExpirado() {
  return (
    <div className="space-y-5 text-center">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Este Pix venceu</h1>
      <p className="text-sm text-muted-foreground">
        O prazo de {RIFA.minutosPix} minutos acabou e a cobrança foi encerrada.
        Nada foi cobrado e nenhum número ficou preso — é só refazer a compra,
        leva menos de um minuto.
      </p>
      <p className="text-xs text-muted-foreground">
        Se você chegou a pagar este Pix, não pague de novo: assim que a
        confirmação chegar, esta tela mostra seus números automaticamente.
      </p>
      <Button asChild size="lg" className="w-full">
        <Link href="/#comprar">Comprar meus números</Link>
      </Button>
    </div>
  );
}
