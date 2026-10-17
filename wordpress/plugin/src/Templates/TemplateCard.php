<?php
/**
 * Validated public template card.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Templates;

/** Public template fields after validation. */
final class TemplateCard {
	/** Create a template card.
	 *
	 * @param array<string,mixed> $data Validated public data.
	 * @param string              $directory Validated source directory.
	 * @param ?string             $url_base Trusted URL base, when available.
	 */
	public function __construct( public readonly array $data, public readonly string $directory = '', public readonly ?string $url_base = null ) {}
}
