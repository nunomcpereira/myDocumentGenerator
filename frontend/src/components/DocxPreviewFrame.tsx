import { AlertCircle, LoaderCircle } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { renderAsync } from "docx-preview";

type DocxPreviewFrameProps = {
  previewUrl: string | null;
  templateFileType?: string;
};

const iframeMarkup = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
        background: #f4ede0;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(217, 93, 57, 0.14), transparent 24%),
          linear-gradient(180deg, #f8f0e3 0%, #efe4d5 100%);
        font-family: "Space Grotesk", sans-serif;
      }

      #docx-mount {
        min-height: calc(100vh - 48px);
      }

      .docx-wrapper {
        background: transparent !important;
        padding: 0 !important;
      }

      .docx {
        margin: 0 auto 24px !important;
        box-shadow: 0 24px 60px rgba(17, 19, 26, 0.14) !important;
      }
    </style>
  </head>
  <body>
    <div id="docx-mount"></div>
  </body>
</html>`;

export const DocxPreviewFrame = memo(function DocxPreviewFrame({ previewUrl, templateFileType }: DocxPreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsupportedMessage = useMemo(() => {
    if (templateFileType && templateFileType !== "docx") {
      return "Live DOCX preview is only available when the source template is a .docx file.";
    }
    return null;
  }, [templateFileType]);

  useEffect(() => {
    setFrameReady(false);
  }, [previewUrl]);

  useEffect(() => {
    if (!previewUrl || !frameReady || unsupportedMessage) {
      return;
    }

    const currentPreviewUrl = previewUrl;
    if (!iframeRef.current?.contentDocument) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadPreview() {
      const frameDocument = iframeRef.current?.contentDocument;
      const mountNode = frameDocument?.getElementById("docx-mount");
      const styleTarget = frameDocument?.head;
      if (!mountNode || !styleTarget) {
        return;
      }

      setLoading(true);
      setError(null);
      mountNode.innerHTML = "";

      try {
        const response = await fetch(currentPreviewUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error("Unable to generate the live DOCX preview.");
        }

        const buffer = await response.arrayBuffer();
        if (cancelled) {
          return;
        }

        await renderAsync(buffer, mountNode, styleTarget, {
          className: "docx-preview-frame",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          breakPages: true,
        });
      } catch (caught) {
        if (controller.signal.aborted || cancelled) {
          return;
        }
        setError(caught instanceof Error ? caught.message : "Unable to render the live DOCX preview.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [frameReady, previewUrl, unsupportedMessage]);

  return (
    <section className="panel-surface flex h-full max-h-[68vh] flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[#fffdf8]/90 p-6 shadow-panel xl:max-h-[74vh]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-steel">Projected spec</p>
          <h2 className="font-serif text-2xl text-ink">Live DOCX preview</h2>
        </div>
      </div>

      {unsupportedMessage ? (
        <div className="flex flex-1 items-center justify-center rounded-[1.5rem] border border-dashed border-stone-300 bg-white/70 px-6 text-center text-sm leading-7 text-steel">
          {unsupportedMessage}
        </div>
      ) : (
        <div className="docx-preview-shell relative flex-1 overflow-hidden rounded-[1.5rem] border border-stone-200 bg-[#f4ede0]">
          <iframe
            ref={iframeRef}
            title="Live DOCX preview"
            srcDoc={iframeMarkup}
            onLoad={() => setFrameReady(true)}
            className="h-full w-full border-0"
          />

          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#f4ede0]/85 backdrop-blur-[2px]">
              <div className="inline-flex items-center gap-3 rounded-full border border-stone-300 bg-white/90 px-5 py-3 text-sm font-medium text-ink shadow-sm">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Updating DOCX preview
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-rose-200 bg-white/95 px-4 py-3 text-sm text-rose-700 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
});