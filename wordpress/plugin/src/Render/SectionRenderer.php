<?php
/** Section renderer.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;
/** Renders the corresponding core element. */
final class SectionRenderer implements ElementRenderer {
	/**
	 * Render escaped element HTML.
	 *
	 * @param ElementNode   $node Node.
	 * @param RenderContext $context Context.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		$tag = $node->value( 'tag', 'section' );
		$tag = \in_array( $tag, [ 'section', 'div', 'header', 'footer', 'main', 'aside', 'nav', 'article' ], true ) ? $tag : 'section';
		return '<' . $tag . Escape::hooks( $node ) . '>' . $context->children_html . '</' . $tag . '>';
	}
}
