<?php
/**
 * Uses a PHP 8.3 function below the PHP 8.2 floor.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

/**
 * Validate.
 *
 * @param string $value Value.
 * @return bool
 */
function blixis_valid( string $value ): bool {
	return json_validate( $value );
}
