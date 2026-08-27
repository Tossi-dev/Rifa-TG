import { BarraMobile } from "@/components/rifa/barra-mobile";
import { Cabecalho } from "@/components/rifa/cabecalho";
import { ComoFunciona } from "@/components/rifa/como-funciona";
import { Hero } from "@/components/rifa/hero";
import { PerguntasFrequentes } from "@/components/rifa/perguntas-frequentes";
import { Rodape } from "@/components/rifa/rodape";
import { SecaoComprar } from "@/components/rifa/secao-comprar";
import { SecaoPremios } from "@/components/rifa/secao-premios";
import { modoDemo } from "@/lib/pagamento";
import { resumo } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  // O resumo vem do servidor para a barra de progresso já nascer preenchida.
  const dados = await resumo();

  return (
    <>
      {modoDemo && (
        <div className="bg-lima px-4 py-2 text-center text-xs font-bold text-escuro">
          MODO DEMONSTRAÇÃO — o Pix gerado aqui é fictício. Configure a conta de
          pagamento para começar a vender de verdade.
        </div>
      )}

      <Cabecalho />

      <main>
        <Hero resumo={dados} />
        <SecaoPremios />
        <ComoFunciona />
        <SecaoComprar />
        <PerguntasFrequentes />
      </main>

      <Rodape />
      <BarraMobile />
    </>
  );
}
