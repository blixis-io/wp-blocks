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
		$value = $node->value( 'text', 'Write something' );
		return '<p' . Escape::hooks( $node ) . '>' . ( \is_string( $value ) ? Escape::html( $value ) : RichText::render_validated( $value, true, $context->token_ids ) ) . '</p>';
	}
}
