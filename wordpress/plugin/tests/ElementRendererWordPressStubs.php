<?php
/** Minimal WordPress translation stubs for catalog-wide pure renderer checks.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Render;

/** Return the source message in pure PHP tests.
 *
 * @param string $message Message.
 * @param string $domain  Text domain.
 */
function __( string $message, string $domain = '' ): string {
	unset( $domain );
	return $message;
}
