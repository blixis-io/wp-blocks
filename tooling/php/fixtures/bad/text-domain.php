<?php
/**
 * Uses a text domain that is not registered.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

/**
 * Label.
 *
 * @return string
 */
function blixis_label(): string {
	return __( 'Hello', 'some-other-domain' );
}
