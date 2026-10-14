<?php
/** Heading renderer.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;
/** Renders the corresponding core element. */
final class HeadingRenderer implements ElementRenderer {
	/**
	 * Render escaped element HTML.
	 *
	 * @param ElementNode   $node Node.
	 * @param RenderContext $context Context.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		$level = \max( 1, \min( 6, (int) $node->value( 'level', 2 ) ) );
		$tag   = 'h' . $level;
		return '<' . $tag . Escape::hooks( $node ) . '>' . Escape::html( (string) $node->value( 'text', 'Heading' ) ) . '</' . $tag . '>';
	}
}
