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
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link screen-reader-text" href="#content"><?php esc_html_e( 'Skip to content', 'blixis' ); ?></a>
<header class="site-header">
	<p class="site-title"><a href="<?php echo esc_url( home_url( '/' ) ); ?>" rel="home"><?php bloginfo( 'name' ); ?></a></p>
	<?php if ( has_nav_menu( 'primary' ) ) : ?>
		<nav class="site-navigation" aria-label="<?php esc_attr_e( 'Primary menu', 'blixis' ); ?>">
			<?php
			wp_nav_menu(
				array(
					'theme_location' => 'primary',
					'container'      => '',
				)
			);
			?>
		</nav>
	<?php endif; ?>
</header>
<main id="content" class="site-main" tabindex="-1">
