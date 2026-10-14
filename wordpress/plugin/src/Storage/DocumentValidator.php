<?php
/**
 * Document-validation extension point (BWB-043).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** A later validator can add schema checks without changing the store. */
interface DocumentValidator {
	/**
	 * Return whether the value may be stored under this key.
	 *
	 * @param string $value Value.
	 * @param string $key Value.
	 */
	public function accepts( string $value, string $key ): bool;
}
