<?php
/**
 * Remove only Builder's own version marker on uninstall.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

\defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

if ( \is_multisite() ) {
	$blixis_builder_sites = \get_sites(
		[
			'fields' => 'ids',
			'number' => 0,
		]
	);
	foreach ( $blixis_builder_sites as $blixis_builder_site_id ) {
		\switch_to_blog( (int) $blixis_builder_site_id );
		\delete_option( 'blixis_builder_version' );
		\restore_current_blog();
	}
} else {
	\delete_option( 'blixis_builder_version' );
}
