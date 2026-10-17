# Rendimiento: línea base móvil de laboratorio — 16/10/2026

## Alcance real

Tres pasadas secuenciales con **Lighthouse 13.5.0**, Chrome headless 155, build de producción local de `de99f2d` (documentación posterior no cambia código), ruta `/` en `http://127.0.0.1:3102`. Build sin conexión Supabase: agenda vacía + aviso de configuración. **No representa una agenda poblada, editor autenticado, consultas RLS remotas ni dispositivo físico. No cierra el gate de rendimiento del MVP por sí sola.**

Emulación mobile 412×823, DPR 1,75; throttling simulado: RTT 150 ms, throughput 1638,4 Kbps y CPU ×4. Storage reseteado por Lighthouse, perfiles propios sin extensiones. No se modificaron dependencias/lockfile del proyecto ni cachés privadas de la aplicación; Lighthouse se ejecutó mediante npm exec con versión fijada. Los reportes no registraron runtimeError ni warnings.

| Medida | Pasada 1 | Pasada 2 | Pasada 3 | Mediana |
|---|---:|---:|---:|---:|
| Performance /100 | 89 | 99 | 99 | 99 |
| Accessibility /100 | 100 | 100 | 100 | 100 |
| Best Practices /100 | 100 | 100 | 100 | 100 |
| FCP (ms) | 761 | 764 | 759 | 761 |
| LCP (ms) | 2592 | 2050 | 2041 | 2050 |
| TBT (ms) | 337 | 18 | 16 | 18 |
| CLS | 0 | 0 | 0 | 0 |
| Transferencia (bytes) | 185076 | 187171 | 184704 | 185076 |

Se conserva explícitamente el resultado inicial de 89; no elegir solo la mejor pasada ni interpretar la mejora entre pasadas como una optimización de código (no hubo cambios). La variabilidad y el calentamiento del host/browser influyen; repetir con carga representativa. Accessibility 100 tampoco reemplaza navegación asistida/manual. [Cómo interpretar puntuaciones y variabilidad](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring).

## Hallazgos y límites

Lighthouse señaló JS parcialmente no utilizado en chunks del runtime, CSS bloqueante (~6,5 KB) y limitación de bfcache por `no-store`. No hay todavía evidencia causal para cambiar arquitectura o caché por estos avisos. **No relajar `no-store` ni privacidad para ganar puntuación.** Antes de Production medir agenda poblada y operaciones de editor/live/feedback con backend real, especialmente primera carga en un móvil modesto, y volver a comprobar PWA física iOS/Android.

Reportes locales JSON/HTML: `/tmp/crono-public-mobile-{1,2,3}.report.{json,html}`; diagnóstico `/tmp/crono-lighthouse.log`. Son artefactos temporales, no un reporte cloud ni monitoreo de usuarios reales.

## Reproducción

Con build de producción local disponible y puerto 3102 libre:

```sh
npm run build
npm run start -- --port 3102
# En otra terminal, sin un navegador personal conectado:
for n in 1 2 3; do
  CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
    npm exec --yes --package=lighthouse@13.5.0 -- lighthouse http://127.0.0.1:3102 \
    --only-categories=performance,accessibility,best-practices \
    --chrome-flags='--headless --no-sandbox' \
    --output=json --output=html --output-path=/tmp/crono-public-mobile-$n --quiet
done
```

La medición registrada usó el build ya aprobado por `npm run check`, no un servidor de desarrollo. Adaptar CHROME_PATH al host; no deshabilitar protecciones de un navegador personal. El servidor temporal se detuvo al finalizar.
