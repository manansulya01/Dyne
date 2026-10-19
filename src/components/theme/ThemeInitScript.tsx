const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("dyne-theme");var m=s?JSON.parse(s):null;var mode=(m&&m.mode)||"system";var accents=["dyne-blue","campus-blue","midnight","ocean","aurora","forest","campus","slate","violet","rose","amber"];var accent=accents.indexOf(m&&m.accent)>=0?m.accent:"campus-blue";var density=(m&&m.density)||"comfortable";if(density!=="compact"&&density!=="comfortable"&&density!=="spacious")density="comfortable";var font=(m&&m.fontScale)||"medium";var motion=(m&&m.motion)||"full";if(motion!=="full"&&motion!=="reduced"&&motion!=="minimal")motion="full";var sys=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var eff=mode==="system"?sys:mode;var r=document.documentElement;r.classList.toggle("dark",eff==="dark");r.dataset.theme=eff;r.dataset.accent=accent;r.dataset.density=density;r.dataset.fontScale=font;r.dataset.motion=motion;}catch(e){}})();`;

export function ThemeInitScript() {
  return (
    <script
      id="dyne-theme-init"
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}
