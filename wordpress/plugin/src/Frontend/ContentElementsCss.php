<?php
/** Scoped styles for progressive content elements.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** Theme-independent styles for code and animated content. */
final class ContentElementsCss {
	/** Return deterministic, scoped CSS. */
	public static function css(): string {
		return '[data-blx-sticky-header]{position:sticky;inset-block-start:var(--blx-sticky-offset,0px);z-index:20;background:Canvas;color:CanvasText}'
			. '[data-blx-offcanvas]>summary{cursor:pointer;padding:.55rem .8rem}'
			. '[data-blx-offcanvas]>summary:focus-visible,[data-blx-offcanvas-close]:focus-visible{outline:2px solid currentColor;outline-offset:2px}'
			. '[data-blx-offcanvas][open][data-blx-offcanvas-modal="true"]::before{content:"";position:fixed;z-index:999;inset:0;background:rgb(0 0 0/.45)}'
			. '[data-blx-offcanvas][open]>[data-blx-offcanvas-panel]{position:fixed;z-index:1000;box-sizing:border-box;overflow:auto;max-width:100vw;max-height:100dvh;padding:1.25rem;background:Canvas;color:CanvasText;box-shadow:0 1rem 3rem rgb(0 0 0/.25)}'
			. '[data-blx-offcanvas-placement="left"][open]>[data-blx-offcanvas-panel]{inset-block:0;inset-inline-start:0;width:min(26rem,90vw)}'
			. '[data-blx-offcanvas-placement="right"][open]>[data-blx-offcanvas-panel]{inset-block:0;inset-inline-end:0;width:min(26rem,90vw)}'
			. '[data-blx-offcanvas-placement="top"][open]>[data-blx-offcanvas-panel]{inset-block-start:0;inset-inline:0;max-height:min(80dvh,40rem)}'
			. '[data-blx-offcanvas-placement="bottom"][open]>[data-blx-offcanvas-panel]{inset-block-end:0;inset-inline:0;max-height:min(80dvh,40rem)}'
			. '[data-blx-offcanvas-animation="fade"][open]>[data-blx-offcanvas-panel]{animation:blx-offcanvas-fade .2s ease-out both}'
			. '[data-blx-offcanvas-animation="scale"][open]>[data-blx-offcanvas-panel]{animation:blx-offcanvas-scale .2s ease-out both}'
			. '[data-blx-offcanvas-animation="slide"][open]>[data-blx-offcanvas-panel]{animation:blx-offcanvas-slide .2s ease-out both}'
			. '[data-blx-offcanvas-animation="slide"][data-blx-offcanvas-placement="left"][open]>[data-blx-offcanvas-panel]{animation-name:blx-offcanvas-slide-left}'
			. '[data-blx-offcanvas-animation="slide"][data-blx-offcanvas-placement="right"][open]>[data-blx-offcanvas-panel]{animation-name:blx-offcanvas-slide-right}'
			. '[data-blx-offcanvas-animation="slide"][data-blx-offcanvas-placement="top"][open]>[data-blx-offcanvas-panel]{animation-name:blx-offcanvas-slide-top}'
			. '[data-blx-offcanvas-animation="slide"][data-blx-offcanvas-placement="bottom"][open]>[data-blx-offcanvas-panel]{animation-name:blx-offcanvas-slide-bottom}'
			. '@keyframes blx-offcanvas-fade{from{opacity:0}to{opacity:1}}@keyframes blx-offcanvas-scale{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}'
			. '@keyframes blx-offcanvas-slide-left{from{opacity:.65;transform:translateX(-.75rem)}to{opacity:1;transform:translateX(0)}}@keyframes blx-offcanvas-slide-right{from{opacity:.65;transform:translateX(.75rem)}to{opacity:1;transform:translateX(0)}}'
			. '@keyframes blx-offcanvas-slide-top{from{opacity:.65;transform:translateY(-.75rem)}to{opacity:1;transform:translateY(0)}}@keyframes blx-offcanvas-slide-bottom{from{opacity:.65;transform:translateY(.75rem)}to{opacity:1;transform:translateY(0)}}'
			. '[data-blx-mega-menu]>ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(14rem,100%),1fr));gap:1rem 1.5rem;list-style:none;margin:0;padding:0}'
			. '[data-blx-mega-menu]>ul>li>a{font-weight:700}'
			. '[data-blx-mega-menu] ul ul{list-style:none;margin-block:.35rem 0;margin-inline:0;padding:0}'
			. '[data-blx-mega-menu] ul ul a{display:block;padding-block:.25rem;color:inherit}'
			. '[data-blx-wizard-steps][data-blx-steps-orientation="horizontal"]{display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;list-style-position:inside}'
			. '[data-blx-wizard-steps][data-blx-steps-orientation="vertical"]{display:flex;flex-direction:column;gap:.5rem;list-style-position:inside}'
			. '[data-blx-mobile-menu] > summary{cursor:pointer;padding:.55rem .8rem}'
			. '[data-blx-mobile-menu] > summary:focus-visible{outline:2px solid currentColor;outline-offset:2px}'
			. '[data-blx-mobile-menu] nav ul{display:flex;flex-direction:column;gap:.25rem;list-style:none;margin:0;padding:.5rem 0}'
			. '[data-blx-mobile-menu] nav a{display:block;padding:.45rem .65rem;color:inherit}'
			. '[data-blx-navigation-orientation="vertical"] ul{display:flex;flex-direction:column;gap:.25rem;list-style:none;margin:0;padding:0}'
			. '[data-blx-navigation-orientation="horizontal"] ul{display:flex;flex-wrap:wrap;gap:.5rem 1rem;list-style:none;margin:0;padding:0}'
			. '[data-blx-code-line-numbers]{counter-reset:blx-code-line}'
			. '[data-blx-tabs] nav[role="tablist"] ul{display:flex;flex-wrap:wrap;gap:.25rem;list-style:none;margin:0;padding:0;border-block-end:1px solid currentColor}'
			. '[data-blx-tabs][data-blx-tabs-orientation="vertical"] nav[role="tablist"] ul{flex-direction:column;align-items:stretch;border-block-end:0;border-inline-start:1px solid currentColor}'
			. '[data-blx-tabs] [role="tab"]{display:block;padding:.55rem .8rem;border:0;border-block-end:.2rem solid transparent;background:transparent;color:inherit;font:inherit;text-decoration:none}'
			. '[data-blx-tabs][data-blx-tabs-orientation="vertical"] [role="tab"]{border-block-end:0;border-inline-start:.2rem solid transparent}'
			. '[data-blx-tabs] [role="tab"][aria-selected="true"]{border-color:currentColor;font-weight:700}'
			. '[data-blx-tabs] [role="tab"]:focus-visible{outline:2px solid currentColor;outline-offset:2px}'
			. '[data-blx-tabs] [role="tabpanel"]{padding-block:.75rem}'
			. '[data-blx-tabs] [role="tabpanel"][hidden]{display:none}'
			. '[data-blx-accordion] details+details{border-block-start:1px solid currentColor}'
			. '[data-blx-accordion] summary{cursor:pointer;padding-block:.5rem}'
			. '[data-blx-code-line]{display:block}'
			. '[data-blx-code-line-numbers] [data-blx-code-line]{counter-increment:blx-code-line}'
			. '[data-blx-code-line-numbers] [data-blx-code-line]::before{content:counter(blx-code-line);display:inline-block;min-width:2.5em;margin-inline-end:1em;opacity:.5;text-align:end;user-select:none}'
			. '[data-blx-code-token="keyword"]{font-weight:700}'
			. '[data-blx-code-token="comment"]{opacity:.65;font-style:italic}'
			. '[data-blx-code-token="string"]{text-decoration:underline dotted;text-underline-offset:.15em}'
			. '[data-blx-code-block] button[hidden]{display:none}'
			. '[data-blx-tooltip-text]{position:relative;cursor:help}'
			. '[data-blx-tooltip-text]>[role="tooltip"]{position:absolute;z-index:10;inset-block-start:100%;inset-inline-start:0;visibility:hidden;min-width:max-content;max-width:min(24rem,90vw);padding:.4rem .6rem;border:1px solid currentColor;border-radius:.25rem;background:Canvas;color:CanvasText}'
			. '[data-blx-tooltip-text]:hover>[role="tooltip"],[data-blx-tooltip-text]:focus>[role="tooltip"]{visibility:visible}'
			. '[data-blx-animated-headline] [data-blx-headline-part]{display:inline-block;animation:blx-headline-in .65s both;animation-delay:calc(var(--blx-headline-index,0)*70ms)}'
			. '@keyframes blx-headline-in{from{opacity:0;transform:translateY(.35em)}to{opacity:1;transform:translateY(0)}}'
			. '[data-blx-gallery] ul{display:grid;grid-template-columns:repeat(var(--blx-gallery-columns,3),minmax(0,1fr));gap:1rem;list-style:none;margin:0;padding:0}'
			. '[data-blx-gallery][data-blx-columns="1"] ul{--blx-gallery-columns:1}[data-blx-gallery][data-blx-columns="2"] ul{--blx-gallery-columns:2}[data-blx-gallery][data-blx-columns="3"] ul{--blx-gallery-columns:3}[data-blx-gallery][data-blx-columns="4"] ul{--blx-gallery-columns:4}[data-blx-gallery][data-blx-columns="5"] ul{--blx-gallery-columns:5}[data-blx-gallery][data-blx-columns="6"] ul{--blx-gallery-columns:6}'
			. '[data-blx-gallery] li img{display:block;width:100%;height:auto}'
			. '@media(max-width:48rem){[data-blx-gallery] ul{--blx-gallery-columns:min(2,var(--blx-gallery-columns,3))}}@media(max-width:32rem){[data-blx-gallery] ul{--blx-gallery-columns:1}}'
			. '.blx-lightbox-dialog{max-width:min(96vw,90rem);max-height:94vh;padding:3rem 1rem 1rem;border:0;background:transparent;color:#fff;overflow:visible}'
			. '.blx-lightbox-dialog::backdrop{background:rgb(0 0 0/.88)}.blx-lightbox-dialog img{display:block;max-width:92vw;max-height:82vh;width:auto;height:auto;margin:auto;object-fit:contain}'
			. '.blx-lightbox-close{position:absolute;inset-block-start:.25rem;inset-inline-end:.25rem;min-width:2.75rem;min-height:2.75rem;border:1px solid currentColor;border-radius:50%;background:#111;color:#fff;font:inherit;font-size:1.5rem;cursor:pointer}'
			. '[data-blx-image-comparison] [data-blx-comparison-canvas]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}'
			. '[data-blx-image-comparison] [data-blx-comparison-canvas] img{display:block;width:100%;height:auto}'
			. '[data-blx-image-comparison][data-blx-comparison-ready] [data-blx-comparison-canvas]{display:block;position:relative;overflow:hidden}'
			. '[data-blx-image-comparison][data-blx-comparison-ready] [data-blx-comparison-after]{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--blx-comparison-position,50%)) 0 0)}'
			. '[data-blx-comparison-label]{display:flex;align-items:center;gap:.75rem}[data-blx-comparison-label] input{flex:1;min-width:8rem}'
			. '@media(min-width:48rem){[data-blx-mobile-menu]>summary{display:none}[data-blx-mobile-menu]>nav{display:block!important}[data-blx-mobile-menu]>nav>ul{flex-direction:row;flex-wrap:wrap}}'
			. '@media(prefers-reduced-motion:reduce){[data-blx-animated-headline] [data-blx-headline-part],[data-blx-offcanvas][open]>[data-blx-offcanvas-panel]{animation:none}}';
	}
}
