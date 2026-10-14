<?php
/**
 * CSS compilation result.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Css;

\defined( 'ABSPATH' ) || exit;

/** Immutable stylesheet, renderer class names, and ordered diagnostics. */
final class CompileResult {
	/**
	 * Create a result.
	 *
	 * @param string                                                   $css Stylesheet.
	 * @param array<string, list<string>>                              $class_names Element id to generated classes.
	 * @param list<array{code: string, path: string, message: string}> $issues Diagnostics.
	 */
	public function __construct(
		public readonly string $css,
		public readonly array $class_names,
		public readonly array $issues
	) {}
}
