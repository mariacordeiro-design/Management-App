"use client";

import { Bug, Lightbulb, MessageSquarePlus, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type FeedbackType = "bug" | "feature";

interface FeedbackData {
  type: FeedbackType;
  title: string;
  description: string;
  page: string;
}

async function submitFeedback(data: FeedbackData) {
  // TODO: trocar por POST /api/feedback quando o backend estiver disponível.
  console.info("Feedback simulado:", data);
  await new Promise(resolve => setTimeout(resolve, 500));
}

export default function FeedbackButton() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const closeModal = () => {
    setIsOpen(false);
    setType("bug");
    setTitle("");
    setDescription("");
    setIsSubmitted(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await submitFeedback({
        type,
        title: title.trim(),
        description: description.trim(),
        page: pathname,
      });
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeClass = (value: FeedbackType) =>
    "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition " +
    (type === value
      ? value === "bug"
        ? "border-red-400 bg-red-500/15 text-red-300"
        : "border-amber-400 bg-amber-500/15 text-amber-300"
      : "border-white/15 text-zinc-300 hover:bg-white/5");

  if (pathname === "/login") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:scale-105 hover:bg-blue-500 focus:ring-2 focus:ring-white focus:outline-none sm:right-6"
        aria-label="Reportar um problema ou sugerir uma funcionalidade"
        title="Enviar feedback"
      >
        <MessageSquarePlus className="h-6 w-6" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6"
          >
            <header className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="feedback-title" className="text-xl font-semibold">
                  Enviar feedback
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Encontraste um problema ou tens uma ideia para melhorar a aplicação?
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
                aria-label="Fechar formulário"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            {isSubmitted ? (
              <div className="py-6 text-center">
                <Send className="mx-auto mb-4 h-10 w-10 text-green-400" />
                <h3 className="text-lg font-semibold">Feedback preparado!</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Obrigado! O envio ficará ativo quando a ligação ao servidor for adicionada.
                </p>
                <button
                  type="button"
                  onClick={closeModal}
                  className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 hover:bg-blue-500"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Tipo de feedback</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setType("bug")}
                      aria-pressed={type === "bug"}
                      className={typeClass("bug")}
                    >
                      <Bug className="h-5 w-5" /> Reportar bug
                    </button>
                    <button
                      type="button"
                      onClick={() => setType("feature")}
                      aria-pressed={type === "feature"}
                      className={typeClass("feature")}
                    >
                      <Lightbulb className="h-5 w-5" /> Nova feature
                    </button>
                  </div>
                </fieldset>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Título</span>
                  <input
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    required
                    maxLength={100}
                    placeholder={type === "bug" ? "Resume o problema" : "Resume a tua ideia"}
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Descrição</span>
                  <textarea
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    required
                    minLength={10}
                    maxLength={1500}
                    rows={5}
                    placeholder={
                      type === "bug"
                        ? "Explica o que aconteceu e o que esperavas."
                        : "Explica como funcionaria e porque seria útil."
                    }
                    className="w-full resize-y rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <span className="mt-1 block text-right text-xs text-zinc-500">
                    {description.length}/1500
                  </span>
                </label>

                <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400">
                  Página: <span className="text-zinc-300">{pathname}</span>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {isSubmitting ? "A preparar..." : "Enviar feedback"}
                </button>
                <p className="text-center text-xs text-zinc-500">
                  Modo de demonstração: os dados ainda não são guardados.
                </p>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
