// Módulo PLANO (sin 'use client', sin hooks): lo leen el hook del cliente y el
// script previo al pintado que se escribe en el servidor.

export const RAIL_STORAGE_KEY = 'fahybrid:v2-rail';

/** Pone `data-rail` en el contenedor del shell antes de hidratar, para que el
 *  menú plegado no salte al cargar. El script es el primer hijo del contenedor. */
export const RAIL_PREPAINT_JS = `(function(){try{var s=document.currentScript;var el=s&&s.parentElement;if(el&&localStorage.getItem('${RAIL_STORAGE_KEY}')==='collapsed')el.setAttribute('data-rail','collapsed');}catch(e){}})();`;
