<?php
/**
 * Site header: document start, skip link, branding and primary navigation.
 *
 * @package Blixis\Theme
 */

?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php echo esc_attr( get_bloginfo( 'charset' ) ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link screen-reader-text" href="#content"><?php esc_html_e( 'Skip to content', 'blixis' ); ?></a>
<header class="site-header site-shell">
	<p class="site-title"><a href="<?php echo esc_url( home_url( '/' ) ); ?>" rel="home"><?php echo esc_html( get_bloginfo( 'name' ) ); ?></a></p>
	<nav class="site-navigation" aria-label="<?php esc_attr_e( 'Primary menu', 'blixis' ); ?>">
		<?php
		wp_nav_menu(
			[
				'theme_location' => 'primary',
				'container'      => '',
			]
		);
		?>
	</nav>
	<?php
	// Language links of the Builder plugin (translated pages only); nothing is printed without the plugin or translations.
	if ( function_exists( 'blixis_builder_locale_switcher' ) ) {
		blixis_builder_locale_switcher();
	}
	?>
	<?php \Blixis\Theme\blixis_appearance_toggle(); ?>
</header>
<?php if ( ! is_singular() ) : ?>
<main id="content" class="site-main site-shell" tabindex="-1">
<?php endif; ?>
