<?php
/** Static, theme-independent styles for the resizable panels enhancement.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** Styles scoped to the resizable-panels element. */
final class ResizablePanelsCss {
	/** Return deterministic scoped CSS. */
	public static function css(): string {
		return '[data-blx-resizable-panels]{display:flex;align-items:stretch;gap:.375rem;min-width:0;min-height:0}'
			. '[data-blx-resizable-panels="vertical"]{flex-direction:column}'
			. '[data-blx-resizable-panel]{flex:1 1 0%;min-width:0;min-height:0;overflow:auto}'
			. '[data-blx-resize-handle]{position:relative;z-index:1;flex:0 0 .5rem;align-self:stretch;touch-action:none;border:0;border-radius:999px;background:currentColor;opacity:.16;cursor:col-resize}'
			. '[data-blx-resizable-panels="vertical"]>[data-blx-resize-handle]{cursor:row-resize}'
			. '[data-blx-resize-handle]:hover,[data-blx-resize-handle]:focus-visible{opacity:.4}'
			. '[data-blx-resize-handle]:focus-visible{outline:2px solid currentColor;outline-offset:2px;opacity:.7}'
			. '@media(max-width:40rem){[data-blx-resizable-panels="horizontal"]{flex-direction:column}[data-blx-resizable-panels="horizontal"]>[data-blx-resizable-panel]{flex:initial!important}[data-blx-resizable-panels="horizontal"]>[data-blx-resize-handle]{display:none}}';
	}
}
