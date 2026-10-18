<?php
/** Element rendering context.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

/** Pre-rendered children keep the document traversal iterative. */
final class RenderContext {
	/**
	 * Apply the documented contract.
	 *
	 * @param string    $children_html Children html.
	 * @param ?string[] $token_ids Active token ids, when available; null means unavailable.
	 * @param string[]  $children_html_list Pre-rendered direct children in document order.
	 */
	public function __construct(
		public readonly string $children_html = '',
		public readonly ?array $token_ids = null,
		public readonly array $children_html_list = []
	) {}
}
