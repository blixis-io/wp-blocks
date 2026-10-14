<?php
/** Text renderer.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;
/** Renders the corresponding core element. */
final class TextRenderer implements ElementRenderer {
	/**
	 * Render escaped element HTML.
	 *
	 * @param ElementNode   $node Node.
	 * @param RenderContext $context Context.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		return '<p' . Escape::hooks( $node ) . '>' . Escape::html( (string) $node->value( 'text', 'Write something' ) ) . '</p>';
	}
}
