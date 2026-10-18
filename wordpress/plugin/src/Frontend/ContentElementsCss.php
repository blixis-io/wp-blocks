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
		return '[data-blx-code-line-numbers]{counter-reset:blx-code-line}'
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
			. '@media(prefers-reduced-motion:reduce){[data-blx-animated-headline] [data-blx-headline-part]{animation:none}}';
	}
}
