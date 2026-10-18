<?php
/** Safe fallback for elements without a renderer.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

/** Emits a static wrapper and already-rendered children. */
final class StaticFallbackRenderer implements ElementRenderer {
	/** Render safe fallback markup.
	 *
	 * @param ElementNode   $node Element input.
	 * @param RenderContext $context Child content and token metadata.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		return '<div' . Escape::hooks( $node ) . ' data-blx-unsupported>' . $context->children_html . '</div>';
	}
}
