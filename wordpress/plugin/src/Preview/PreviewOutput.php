<?php
/**
 * Renderer output before final safety checks.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Preview;

\defined( 'ABSPATH' ) || exit;

/** HTML fragment and compiled CSS. */
final class PreviewOutput {
	/** Construct renderer output.
	 *
	 * @param string $html HTML fragment.
	 * @param string $css Compiled CSS.
	 */
	public function __construct( public readonly string $html, public readonly string $css ) {}
}
