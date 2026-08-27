"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import type { PedidoView } from "@/lib/pedido";
import { PainelConfirmado } from "./painel-confirmado";
import { PainelExpirado } from "./painel-expirado";
import { PainelPix } from "./painel-pix";
import { PainelReembolso } from "./painel-reembolso";

/**
 * Orquestra a tela de pagamento:
 * - consulta o status enquanto o pedido não tem desfecho
 * - mantém o cronômetro da cobrança Pix
 * - escolhe qual painel mostrar (pendente, pago, vencido ou a reembolsar)
 *
 * O polling continua mesmo depois de o Pix vencer, porque `expirado` não é
 * ponto final: um pagamento que chegue atrasado ainda vira compra válida e a
 * tela precisa mostrar os números quando isso acontecer.
 */
export function AcompanharPedido({ inicial }: { inicial: PedidoView }) {
  const [pedido, setPedido] = useState<PedidoView>(inicial);
  const [copiado, setCopiado] = useState<boolean>(false);
  const [restante, setRestante] = useState<number | null>(null);
  const [simulando, setSimulando] = useState<boolean>(false);

  const buscar = useCallback(async (): Promise<void> => {
    try {
      const resposta = await fetch(`/api/pedidos/${inicial.id}`, {
        cache: "no-store",
      });
      if (resposta.ok) setPedido((await resposta.json()) as PedidoView);
    } catch {
      /* offline: tenta de novo no próximo ciclo */
    }
  }, [inicial.id]);

  /* Polling do status — para só quando o pedido tem desfecho definitivo.
     Enquanto está "pendente" pergunta de 4 em 4 segundos; depois de vencido
     afrouxa para 20s, o suficiente para pegar um pagamento atrasado sem ficar
     martelando a API de graça. */
  const semDesfecho =
    pedido.status === "pendente" || pedido.status === "expirado";

  useEffect(() => {
    if (!semDesfecho) return;
    const intervalo = pedido.status === "pendente" ? 4000 : 20_000;
    const t = setInterval(buscar, intervalo);
    const aoVoltar = (): void => {
      if (document.visibilityState === "visible") void buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [semDesfecho, pedido.status, buscar]);

  /* Cronômetro da cobrança Pix. */
  useEffect(() => {
    if (pedido.status !== "pendente") return;
    const tick = (): void =>
      setRestante(Math.max(0, pedido.expiraEm - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pedido.status, pedido.expiraEm]);

  async function copiar(): Promise<void> {
    if (!pedido.codigoPix) return;
    try {
      await navigator.clipboard.writeText(pedido.codigoPix);
    } catch {
      // Navegadores sem permissão de área de transferência: seleciona o campo.
      const campo = document.getElementById("brcode");
      if (campo instanceof HTMLInputElement) campo.select();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2200);
  }

  async function simular(): Promise<void> {
    setSimulando(true);
    await fetch(`/api/pedidos/${pedido.id}/simular`, { method: "POST" });
    await buscar();
    setSimulando(false);
  }

  return (
    <Card className="w-full max-w-lg">
      <CardContent>
        {pedido.status === "pago" && <PainelConfirmado pedido={pedido} />}
        {pedido.status === "reembolsar" && <PainelReembolso pedido={pedido} />}
        {pedido.status === "expirado" && <PainelExpirado />}
        {pedido.status === "pendente" && (
          <PainelPix
            pedido={pedido}
            restante={restante}
            copiado={copiado}
            aoCopiar={() => void copiar()}
            simulando={simulando}
            aoSimular={() => void simular()}
          />
        )}
      </CardContent>
    </Card>
  );
}
