<?php
/**
 * PHPStan must reject this file.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

namespace Blixis\Tooling\Fixtures;

/**
 * Returns an int where a string is declared.
 *
 * @param int $value Input.
 * @return string
 */
function wrong_return( int $value ): string {
	return $value;
}
