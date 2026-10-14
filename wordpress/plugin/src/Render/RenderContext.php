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
	 * @param string $children_html Children html.
	 */
	public function __construct( public readonly string $children_html = '' ) {}
}
