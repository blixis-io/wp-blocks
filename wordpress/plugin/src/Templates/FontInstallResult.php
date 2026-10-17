<?php
/**
 * Font Library installation outcome.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Templates;

/** Result returned by the installer. */
final class FontInstallResult {
	/** Create an install result.
	 *
	 * @param bool          $success Whether installation succeeded.
	 * @param int|null      $family_id Installed family post ID.
	 * @param array<string> $errors Fixed error messages.
	 */
	public function __construct( public readonly bool $success, public readonly ?int $family_id = null, public readonly array $errors = [] ) {}
}
