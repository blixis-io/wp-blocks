<?php
/**
 * Visitor appearance control (BWB-113).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/** Print the visitor appearance control only while the site follows the system. */
function blixis_appearance_toggle(): void {
	if ( 'auto' !== Appearance::site_mode() ) {
		return;
	}
	$announcements = [
		'system' => __( 'Appearance follows your system setting', 'blixis' ),
		'light'  => __( 'Light appearance selected', 'blixis' ),
		'dark'   => __( 'Dark appearance selected', 'blixis' ),
	];
	$messages      = wp_json_encode( $announcements );
	if ( false === $messages ) {
		return;
	}
	$labels = [
		'system' => __( 'System', 'blixis' ),
		'light'  => __( 'Light', 'blixis' ),
		'dark'   => __( 'Dark', 'blixis' ),
	];
	?>
	<div class="appearance-toggle" data-announcements="<?php echo esc_attr( $messages ); ?>" hidden>
		<div role="group" aria-label="<?php echo esc_attr__( 'Appearance', 'blixis' ); ?>">
			<?php foreach ( $labels as $value => $label ) : ?>
				<button type="button" data-appearance="<?php echo esc_attr( $value ); ?>" aria-pressed="<?php echo 'system' === $value ? 'true' : 'false'; ?>"><?php echo esc_html( $label ); ?></button>
			<?php endforeach; ?>
		</div>
		<span class="screen-reader-text" aria-live="polite" aria-atomic="true"></span>
	</div>
	<?php
}
