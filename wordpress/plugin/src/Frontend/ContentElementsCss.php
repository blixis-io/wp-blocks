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
			. '@media(prefers-reduced-motion:reduce){[data-blx-animated-headline] [data-blx-headline-part]{animation:none}}';
	}
}
