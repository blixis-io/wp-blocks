<?php
/** Static, reduced-motion-aware styles for the marquee element.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** Styles scoped to the marquee element. */
final class MarqueeCss {
	/** Return deterministic scoped CSS. */
	public static function css(): string {
		return '[data-blx-marquee-viewport]{overflow:hidden;max-width:100%}'
			. '[data-blx-marquee-track]{display:flex;width:max-content;align-items:center;gap:1rem}'
			. '[data-blx-marquee-group]{display:flex;flex:0 0 max-content;align-items:center;gap:1rem;min-width:100%}'
			. '[data-blx-marquee-group][aria-hidden="true"]{display:none}'
			. '[data-blx-marquee-toggle]{display:none}'
			. '[data-blx-marquee][data-blx-marquee-ready="true"] [data-blx-marquee-group][aria-hidden="true"]{display:flex}'
			. '[data-blx-marquee][data-blx-marquee-ready="true"] [data-blx-marquee-track]{animation:blx-marquee-left var(--blx-marquee-duration,30s) linear infinite}'
			. '[data-blx-marquee="right"][data-blx-marquee-ready="true"] [data-blx-marquee-track]{animation-name:blx-marquee-right}'
			. '[data-blx-marquee][data-blx-marquee-ready="true"] [data-blx-marquee-toggle]{display:inline-flex}'
			. '[data-blx-marquee-paused] [data-blx-marquee-track],[data-blx-marquee]:hover [data-blx-marquee-track],[data-blx-marquee]:focus-within [data-blx-marquee-track]{animation-play-state:paused}'
			. '@keyframes blx-marquee-left{to{transform:translateX(-50%)}}'
			. '@keyframes blx-marquee-right{from{transform:translateX(-50%)}to{transform:translateX(0)}}'
			. '@media(prefers-reduced-motion:reduce){[data-blx-marquee-track]{animation:none!important;transform:none!important}[data-blx-marquee-group][aria-hidden="true"]{display:none!important}}';
	}
}
