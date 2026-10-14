<?php
/**
 * Conforming example.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

namespace Blixis\Tooling\Fixtures;

/**
 * Doubles a number.
 *
 * @param int $value Input.
 * @return int
 */
function double_value( int $value ): int {
	return $value * 2;
}
