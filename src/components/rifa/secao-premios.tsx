import { RIFA } from "@/lib/config";
import { CardPremio } from "./card-premio";
import { TituloSecao } from "./titulo-secao";

/** Lista dos três prêmios da rifa. */
export function SecaoPremios() {
  return (
    <section id="premios" className="bg-secondary/60 py-14">
      <div className="mx-auto max-w-6xl px-4">
        <TituloSecao
          etiqueta="Os prêmios"
          titulo="Três prêmios, um número só"
          texto="O mesmo número concorre a tudo. Se o seu for sorteado, você leva o prêmio da posição correspondente."
        />

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {RIFA.premios.map((premio, indice) => (
            <CardPremio
              key={premio.posicao}
              premio={premio}
              destaque={indice === 0}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
