import { Separator } from "@/components/ui/separator";
import { RIFA, linkWhatsApp } from "@/lib/config";

/** Rodapé com informações do sorteio, contato e aviso legal. */
export function Rodape() {
  return (
    <footer className="bg-escuro pt-12 pb-28 text-white/75 lg:pb-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h4 className="mb-2 font-bold text-white">{RIFA.organizador}</h4>
            <p className="text-sm">{RIFA.textoLegal}</p>
          </div>

          <div>
            <h4 className="mb-2 font-bold text-white">O sorteio</h4>
            <ul className="space-y-1 text-sm">
              <li>Data: {RIFA.dataSorteioLabel}</li>
              <li>{RIFA.formaSorteio}</li>
              <li>Resultado divulgado nas nossas redes</li>
            </ul>
          </div>

          <div>
            <h4 className="mb-2 font-bold text-white">Fale com a gente</h4>
            <ul className="space-y-1 text-sm">
              <li>
                <a
                  href={linkWhatsApp(
                    `Olá! Tenho uma dúvida sobre a ${RIFA.titulo}.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-lima"
                >
                  WhatsApp {RIFA.whatsappLabel}
                </a>
              </li>
              {RIFA.instagram && (
                <li>
                  <a
                    href={`https://instagram.com/${RIFA.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-lima"
                  >
                    @{RIFA.instagram}
                  </a>
                </li>
              )}
              <li>{RIFA.cidade}</li>
            </ul>
          </div>
        </div>

        <Separator className="my-8 bg-white/15" />

        <div className="flex flex-col gap-2 text-xs sm:flex-row sm:justify-between">
          <span>
            © {new Date().getFullYear()} {RIFA.organizador} · {RIFA.cidade}
          </span>
          <span>Proibida a participação de menores de 18 anos.</span>
        </div>
      </div>
    </footer>
  );
}
