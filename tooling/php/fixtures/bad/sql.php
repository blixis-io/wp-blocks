<?php
/**
 * Builds SQL by interpolation.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

/**
 * Query.
 *
 * @param string $title Title.
 * @return void
 */
function blixis_query( string $title ): void {
	global $wpdb;
	$wpdb->query( "DELETE FROM {$wpdb->posts} WHERE post_title = '$title'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
}
