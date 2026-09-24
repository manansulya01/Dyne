import Script from "next/script";

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("dyne-theme");var m=s?JSON.parse(s):null;var mode=(m&&m.mode)||"system";var accent=(m&&m.accent)||"dyne-blue";var density=(m&&m.density)||"comfortable";var font=(m&&m.fontScale)||"medium";var motion=(m&&m.motion)||"full";var sys=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var eff=mode==="system"?sys:mode;var r=document.documentElement;r.classList.toggle("dark",eff==="dark");r.dataset.theme=eff;r.dataset.accent=accent;r.dataset.density=density;r.dataset.fontScale=font;r.dataset.motion=motion;}catch(e){}})();`;

export function ThemeInitScript() {
  return (
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script id="dyne-theme-init" strategy="beforeInteractive">
      {THEME_INIT_SCRIPT}
    </Script>
  );
}